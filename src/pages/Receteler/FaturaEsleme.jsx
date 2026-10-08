import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Trash2 } from 'lucide-react';
import SecimKutusu from './SecimKutusu';
import { MalzemeFormu } from './HamMaddeler';
import { fiyatFmt, fmt, onerilenCarpan, rcApi, sayi, tarihTR, TL, xmlDosyalariniYukle } from './rcOrtak';

// Fatura kalemlerini ham maddelere bağlar. Aynı tedarikçi + ürün bir kez eşlenir; sözlüğe yazılır ve
// o kalemi taşıyan tüm faturalar (ileride yüklenecekler dahil) otomatik fiyatlanır.
export default function FaturaEsleme({ onYenile, bildir }) {
  const [faturalar, setFaturalar] = useState(null);
  const [sozluk, setSozluk] = useState([]);
  const [malzemeler, setMalzemeler] = useState([]);
  const [bolum, setBolum] = useState('bekleyen');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [yeniMalzeme, setYeniMalzeme] = useState(null); // { ad, anahtar }
  const dosyaRef = useRef(null);

  async function yukle() {
    try {
      const [x, s, m] = await Promise.all([rcApi('xmlListe'), rcApi('sozluk'), rcApi('malzemeler')]);
      setFaturalar(x.faturalar);
      setSozluk(s.kayitlar);
      setMalzemeler(m.malzemeler.filter((z) => z.aktif));
    } catch (e) {
      bildir(e.message, true);
    }
  }
  useEffect(() => {
    yukle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Eşlenmemiş kalemler: tedarikçi + ürün başına TEK satır
  const bekleyenler = useMemo(() => {
    const harita = new Map();
    (faturalar || []).forEach((f) => {
      f.satirlar.forEach((s) => {
        if (s.durum !== 'bekliyor') return;
        let g = harita.get(s.anahtar);
        if (!g) {
          g = { anahtar: s.anahtar, tedarikci: f.tedarikciAdi, urunKodu: s.urunKodu, urunAdi: s.urunAdi, birimKodu: s.birimKodu, birimAdi: s.birimAdi, xmlId: f.id, satirNo: s.siraNo, satirSayisi: 0, faturaSayisi: new Set(), ornekFiyat: s.birimFiyatKdvDahil, ornekTarih: f.tarih, supheli: false };
          harita.set(s.anahtar, g);
        }
        g.satirSayisi += 1;
        g.faturaSayisi.add(f.id);
        if (f.tarih > g.ornekTarih) {
          g.ornekTarih = f.tarih;
          g.ornekFiyat = s.birimFiyatKdvDahil;
          g.xmlId = f.id;
          g.satirNo = s.siraNo;
        }
        if (s.supheli) g.supheli = true;
      });
    });
    return [...harita.values()].sort((a, b) => a.tedarikci.localeCompare(b.tedarikci, 'tr') || a.urunAdi.localeCompare(b.urunAdi, 'tr'));
  }, [faturalar]);

  async function yukleDosya(e) {
    const dosyalar = [...(e.target.files || [])];
    e.target.value = '';
    if (!dosyalar.length) return;
    setYukleniyor(true);
    try {
      const j = await xmlDosyalariniYukle(dosyalar);
      const mesaj = [`${j.eklenen} yeni fatura`, j.mukerrer ? `${j.mukerrer} zaten yüklüydü` : '', j.satisAtlandi ? `${j.satisAtlandi} satış faturası atlandı` : '', j.islenenFiyat ? `${j.islenenFiyat} fiyat otomatik işlendi` : '', j.hatalar.length ? `${j.hatalar.length} dosyada hata` : ''].filter(Boolean).join(' · ');
      bildir(mesaj, j.hatalar.length > 0);
      await yukle();
      onYenile();
    } catch (err) {
      bildir(err.message, true);
    } finally {
      setYukleniyor(false);
    }
  }

  async function sozlukSil(id) {
    if (!window.confirm('Bu eşleme sözlükten silinsin mi? (Daha önce işlenmiş fiyatlar silinmez.)')) return;
    try {
      await rcApi('sozlukSil', { method: 'POST', body: { id } });
      await yukle();
    } catch (e) {
      bildir(e.message, true);
    }
  }

  return (
    <div className="m2-card rc-kart">
      <div className="rc-arac">
        <button className={`m2-chip ${bolum === 'bekleyen' ? 'on' : ''}`} onClick={() => setBolum('bekleyen')}>
          Eşleme bekleyen kalemler <b>{bekleyenler.length}</b>
        </button>
        <button className={`m2-chip ${bolum === 'sozluk' ? 'on' : ''}`} onClick={() => setBolum('sozluk')}>
          Sözlük <b>{sozluk.length}</b>
        </button>
        <span className="rc-bosluk" />
        <input ref={dosyaRef} type="file" accept=".zip,.xml" multiple hidden onChange={yukleDosya} />
        <button className="m2-btn mini" disabled={yukleniyor} onClick={() => dosyaRef.current?.click()}>
          <Upload size={14} style={{ verticalAlign: '-2px' }} /> {yukleniyor ? 'Yükleniyor…' : 'XML / ZIP yükle'}
        </button>
      </div>
      <p className="m2-hint" style={{ marginTop: 0 }}>
        Faturalar yalnızca fiyat okumak için kullanılır; fiş/fatura kaydı otomatik açılmaz. Her kalem bir kez eşlenir: seçtiğiniz malzeme ve birim çarpanıyla aynı kalemi taşıyan tüm faturalar (sonradan yüklenenler dahil) otomatik fiyatlanır. Fiyat = satır tutarı (KDV + iskonto dahil) ÷ (miktar × çarpan).
      </p>

      {faturalar === null && <p className="m2-empty">Yükleniyor…</p>}

      {faturalar && bolum === 'bekleyen' && (
        <div className="m2-table-wrap">
          <table className="m2-table rc-esle-tablo">
            <thead>
              <tr>
                <th>Tedarikçi / ürün</th>
                <th>Fatura birimi</th>
                <th className="sayi">Son fiyat (fatura birimi)</th>
                <th style={{ minWidth: 220 }}>Malzeme</th>
                <th>1 fatura birimi =</th>
                <th className="sayi">Malzeme fiyatı</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {bekleyenler.length === 0 && (
                <tr><td colSpan={7} className="m2-empty">{faturalar.length ? 'Eşleme bekleyen kalem yok.' : 'Henüz fatura yüklenmedi. XML veya ZIP yükleyin.'}</td></tr>
              )}
              {bekleyenler.map((g) => (
                <EsleSatiri key={g.anahtar} g={g} malzemeler={malzemeler} onYeniMalzeme={() => setYeniMalzeme(g)} yeniSecilen={yeniMalzeme && yeniMalzeme.sonuc && yeniMalzeme.anahtar === g.anahtar ? yeniMalzeme.sonuc : null} onYeniTuketildi={() => setYeniMalzeme(null)}
                  onKaydet={async (body) => {
                    try {
                      const j = await rcApi('xmlSatirEsle', { method: 'POST', body: { xmlId: g.xmlId, satirNo: g.satirNo, ...body } });
                      bildir(body.yoksay ? 'Kalem yoksayıldı' : `Eşlendi — ${j.islenen} fatura satırının fiyatı işlendi`);
                      await yukle();
                      onYenile();
                    } catch (e) {
                      bildir(e.message, true);
                    }
                  }} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {faturalar && bolum === 'sozluk' && (
        <div className="m2-table-wrap">
          <table className="m2-table rc-esle-tablo">
            <thead>
              <tr><th>Tedarikçi</th><th>Ürün</th><th>Malzeme</th><th className="sayi">Çarpan</th><th /></tr>
            </thead>
            <tbody>
              {sozluk.length === 0 && <tr><td colSpan={5} className="m2-empty">Sözlük boş.</td></tr>}
              {sozluk.map((s) => (
                <tr key={s.id}>
                  <td>{s.tedarikci}</td>
                  <td>{s.urunAdi} {s.urunKodu && <small className="rc-sonuk">({s.urunKodu})</small>}</td>
                  <td>{s.yoksay ? <span className="rc-sonuk">yoksayılıyor</span> : <>{s.malzeme} <small className="rc-sonuk">({s.birim})</small></>}</td>
                  <td className="sayi">{s.yoksay ? '—' : fmt(s.carpan, 4).replace(/,?0+$/, '')}</td>
                  <td><button className="rc-ikon-btn" onClick={() => sozlukSil(s.id)} aria-label="Sil"><Trash2 size={15} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {yeniMalzeme && !yeniMalzeme.sonuc && (
        <MalzemeFormu
          m={{ ad: yeniMalzeme.urunAdi, birim: 'kg', fire: 0, tur: 'malzeme', aktif: true }}
          bildir={bildir}
          onKapat={() => setYeniMalzeme(null)}
          onKaydedildi={async (id) => {
            await yukle();
            setYeniMalzeme(id ? { ...yeniMalzeme, sonuc: id } : null);
          }}
        />
      )}
    </div>
  );
}

function EsleSatiri({ g, malzemeler, onKaydet, onYeniMalzeme, yeniSecilen, onYeniTuketildi }) {
  const [malzemeId, setMalzemeId] = useState('');
  const [carpan, setCarpan] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const secenekler = useMemo(() => malzemeler.map((m) => ({ id: m.id, ad: m.ad, grup: m.tur === 'ambalaj' ? 'Ambalaj' : '', ek: m.birim })), [malzemeler]);
  const malzeme = malzemeler.find((m) => m.id === malzemeId);

  useEffect(() => {
    if (yeniSecilen) {
      sec(yeniSecilen);
      onYeniTuketildi();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yeniSecilen, malzemeler]);

  function sec(id) {
    setMalzemeId(id);
    const m = malzemeler.find((x) => x.id === id);
    const oner = m ? onerilenCarpan(g.birimKodu, m.birim) : null;
    setCarpan(oner != null ? String(oner).replace('.', ',') : '');
  }

  const c = sayi(carpan);
  const fiyat = malzeme && c > 0 && g.ornekFiyat ? g.ornekFiyat / c : null;

  return (
    <tr>
      <td>
        <b>{g.urunAdi || '(adsız)'}</b> {g.urunKodu && <small className="rc-sonuk">{g.urunKodu}</small>}
        <div className="rc-sonuk">{g.tedarikci} · {g.faturaSayisi.size} fatura{g.supheli ? ' · ⚠ miktar/tutar şüpheli' : ''}</div>
      </td>
      <td>{g.birimAdi || g.birimKodu}</td>
      <td className="sayi">{g.ornekFiyat != null ? `${TL(g.ornekFiyat)}` : '—'}<div className="rc-sonuk">{tarihTR(g.ornekTarih)}</div></td>
      <td className="rc-hucre-sec">
        <SecimKutusu secenekler={secenekler} deger={malzemeId} onSec={sec} yer="Malzeme seç…" onYeni={onYeniMalzeme} yeniEtiket="+ Yeni malzeme tanımla" />
      </td>
      <td>
        {malzeme ? (
          <div className="rc-miktar">
            <input className="m2-input" inputMode="decimal" value={carpan} onChange={(e) => setCarpan(e.target.value)} placeholder="?" />
            <span>{malzeme.birim}</span>
          </div>
        ) : (
          <span className="rc-sonuk">önce malzeme seçin</span>
        )}
      </td>
      <td className="sayi">{fiyat != null ? <b>{fiyatFmt(fiyat)} ₺/{malzeme.birim}</b> : '—'}</td>
      <td className="rc-islem">
        <button className="m2-btn mini" disabled={!malzeme || !(c > 0) || bekliyor} onClick={async () => { setBekliyor(true); await onKaydet({ malzemeId, carpan }); setBekliyor(false); }}>Eşle</button>
        <button className="m2-btn sec mini" disabled={bekliyor} title="Nakliye, kira vb. — fiyat okunmasın" onClick={async () => { setBekliyor(true); await onKaydet({ yoksay: true }); setBekliyor(false); }}>Yoksay</button>
      </td>
    </tr>
  );
}
