import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, X, ArrowRightToLine, EyeOff, Undo2, Trash2 } from 'lucide-react';
import { TL, tarihTR, trNorm } from './m2Ortak';
import { rcApi, xmlDosyalariniYukle } from '../Receteler/rcOrtak';

const DURUMLAR = [
  ['bekliyor', 'Bekleyen'],
  ['kullanildi', 'Kullanılan'],
  ['gizli', 'Gizlenen'],
  ['hepsi', 'Hepsi'],
];
const SIRALAR = [
  ['yeni', 'Tarih (yeni → eski)'],
  ['eski', 'Tarih (eski → yeni)'],
  ['tutar', 'Tutar (yüksek → düşük)'],
  ['firma', 'Firma (A → Z)'],
];

// Fiş/Fatura sekmesindeki "Yüklenen faturalar" çekmecesi. Varsayılan KAPALI; Makbuz kartının üstüne açılır.
// Buradan yalnızca Fiş/Fatura formunu doldurmak için "Aktar" denir — fiş/fatura asla otomatik kesilmez.
export default function XmlCekmece({ onKapat, bildir, onAktar, onSayi }) {
  const [liste, setListe] = useState(null);
  const [durum, setDurum] = useState('bekliyor');
  const [ara, setAra] = useState('');
  const [bas, setBas] = useState('');
  const [bit, setBit] = useState('');
  const [sirala, setSirala] = useState('yeni');
  const [yukleniyor, setYukleniyor] = useState(false);
  const dosyaRef = useRef(null);

  async function yukle() {
    try {
      const j = await rcApi('xmlListe', { query: { hafif: '1' } });
      setListe(j.faturalar);
      onSayi(j.faturalar.filter((f) => f.durum === 'bekliyor').length);
    } catch (e) {
      bildir(e.message, true);
    }
  }
  useEffect(() => {
    yukle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sayilar = useMemo(() => {
    const s = { bekliyor: 0, kullanildi: 0, gizli: 0, hepsi: 0 };
    (liste || []).forEach((f) => {
      s[f.durum] += 1;
      s.hepsi += 1;
    });
    return s;
  }, [liste]);

  const gorunen = useMemo(() => {
    const n = trNorm(ara);
    const l = (liste || []).filter(
      (f) =>
        (durum === 'hepsi' || f.durum === durum) &&
        (!n || trNorm(`${f.tedarikciAdi} ${f.faturaNo}`).includes(n)) &&
        (!bas || (f.tarih && f.tarih >= bas)) &&
        (!bit || (f.tarih && f.tarih <= bit)),
    );
    const k = {
      yeni: (a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')) || String(a.tedarikciAdi).localeCompare(String(b.tedarikciAdi), 'tr'),
      eski: (a, b) => String(a.tarih || '').localeCompare(String(b.tarih || '')) || String(a.tedarikciAdi).localeCompare(String(b.tedarikciAdi), 'tr'),
      tutar: (a, b) => (b.toplam || 0) - (a.toplam || 0),
      firma: (a, b) => String(a.tedarikciAdi).localeCompare(String(b.tedarikciAdi), 'tr') || String(b.tarih || '').localeCompare(String(a.tarih || '')),
    }[sirala];
    return [...l].sort(k);
  }, [liste, durum, ara, bas, bit, sirala]);

  const toplam = gorunen.reduce((t, f) => t + (f.toplam || 0), 0);

  async function durumYaz(f, yeniDurum) {
    try {
      await rcApi('xmlDurum', { method: 'POST', body: { id: f.id, durum: yeniDurum } });
      await yukle();
    } catch (e) {
      bildir(e.message, true);
    }
  }
  async function sil(f) {
    if (!window.confirm(`${f.tedarikciAdi} · ${f.faturaNo} listeden silinsin mi? (Fiş/fatura kaydına dokunulmaz; fiyatlar kalır.)`)) return;
    try {
      await rcApi('xmlSil', { method: 'POST', body: { id: f.id } });
      await yukle();
    } catch (e) {
      bildir(e.message, true);
    }
  }
  async function yukleDosya(e) {
    const dosyalar = [...(e.target.files || [])];
    e.target.value = '';
    if (!dosyalar.length) return;
    setYukleniyor(true);
    try {
      const j = await xmlDosyalariniYukle(dosyalar);
      bildir(
        [`${j.eklenen} yeni fatura`, j.mukerrer ? `${j.mukerrer} zaten yüklüydü` : '', j.satisAtlandi ? `${j.satisAtlandi} satış faturası atlandı` : '', j.hatalar.length ? `${j.hatalar.length} dosyada hata` : ''].filter(Boolean).join(' · '),
        j.hatalar.length > 0,
      );
      await yukle();
    } catch (err) {
      bildir(err.message, true);
    } finally {
      setYukleniyor(false);
    }
  }

  let sonTarih = null;
  return (
    <div className="m2-xc" role="dialog" aria-label="Yüklenen faturalar">
      <div className="m2-xc-ust">
        <h2>Yüklenen faturalar</h2>
        <input ref={dosyaRef} type="file" accept=".zip,.xml" multiple hidden onChange={yukleDosya} />
        <button className="m2-btn sec mini" disabled={yukleniyor} onClick={() => dosyaRef.current?.click()}>
          <Upload size={14} style={{ verticalAlign: '-2px' }} /> {yukleniyor ? 'Yükleniyor…' : 'XML / ZIP yükle'}
        </button>
        <button className="m2-xc-kapat" onClick={onKapat} aria-label="Çekmeceyi kapat">
          <X size={18} />
        </button>
      </div>

      <div className="m2-xc-filtre">
        <div className="m2-chips">
          {DURUMLAR.map(([k, e]) => (
            <button key={k} className={`m2-chip ${durum === k ? 'on' : ''}`} onClick={() => setDurum(k)}>
              {e} <b>{sayilar[k]}</b>
            </button>
          ))}
        </div>
        <div className="m2-xc-satir">
          <input className="m2-input" placeholder="Firma veya fatura no ara…" value={ara} onChange={(e) => setAra(e.target.value)} />
          <select className="m2-select" value={sirala} onChange={(e) => setSirala(e.target.value)} aria-label="Sıralama">
            {SIRALAR.map(([k, e]) => (
              <option key={k} value={k}>{e}</option>
            ))}
          </select>
        </div>
        <div className="m2-xc-satir">
          <label>
            Başlangıç
            <input className="m2-input" type="date" value={bas} onChange={(e) => setBas(e.target.value)} />
          </label>
          <label>
            Bitiş
            <input className="m2-input" type="date" value={bit} onChange={(e) => setBit(e.target.value)} />
          </label>
          {(bas || bit || ara) && (
            <button className="m2-btn sec mini" onClick={() => { setBas(''); setBit(''); setAra(''); }}>Temizle</button>
          )}
        </div>
      </div>

      <div className="m2-xc-ozet">
        {gorunen.length} fatura · {TL(toplam)}
      </div>

      <div className="m2-xc-liste">
        {liste === null && <p className="m2-empty">Yükleniyor…</p>}
        {liste && gorunen.length === 0 && <p className="m2-empty">{liste.length ? 'Bu filtrede fatura yok.' : 'Henüz fatura yüklenmedi. XML veya ZIP yükleyin.'}</p>}
        {gorunen.map((f) => {
          const baslik = sirala === 'yeni' || sirala === 'eski' ? f.tarih : null;
          const yeniGun = baslik !== null && baslik !== sonTarih;
          if (baslik !== null) sonTarih = baslik;
          return (
            <div key={f.id}>
              {yeniGun && <div className="m2-xc-gun">{tarihTR(f.tarih) || 'Tarihsiz'}</div>}
              <div className={`m2-xc-fatura ${f.durum}`}>
                <div className="m2-xc-bilgi">
                  <b title={f.tedarikciAdi}>{f.tedarikciAdi}</b>
                  <span>
                    {sirala === 'tutar' || sirala === 'firma' ? `${tarihTR(f.tarih)} · ` : ''}No {f.faturaNo} · {f.satirSayisi} kalem
                    {f.bekleyenSatir > 0 && f.durum !== 'gizli' ? <em> · {f.bekleyenSatir} kalem eşleme bekliyor</em> : null}
                  </span>
                </div>
                <div className="m2-xc-tutar">{TL(f.toplam)}</div>
                <div className="m2-xc-islem">
                  {f.durum === 'bekliyor' && (
                    <>
                      <button className="m2-btn mini" onClick={() => onAktar(f)} title="Fiş/Fatura formunu bu faturayla doldur">
                        <ArrowRightToLine size={14} style={{ verticalAlign: '-2px' }} /> Aktar
                      </button>
                      <button className="m2-xc-ikon" onClick={() => durumYaz(f, 'gizli')} title="Gizle (formda gerek yok)" aria-label="Gizle">
                        <EyeOff size={15} />
                      </button>
                    </>
                  )}
                  {f.durum === 'kullanildi' && <span className="m2-xc-rozet">kullanıldı</span>}
                  {(f.durum === 'kullanildi' || f.durum === 'gizli') && (
                    <button className="m2-xc-ikon" onClick={() => durumYaz(f, 'bekliyor')} title="Bekleyenlere geri al" aria-label="Geri al">
                      <Undo2 size={15} />
                    </button>
                  )}
                  <button className="m2-xc-ikon" onClick={() => sil(f)} title="Listeden sil" aria-label="Sil">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
