import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Image as ImageIcon, Search } from 'lucide-react';
import RaporPaylas from './RaporPaylas';
import { raporHesapla, farkEtiketi, kurus, tarihKisa, saatYaz, trNorm, TUR_SIRA } from './raporVeri';
import './KasaRapor.css';

// Kasa & Rapor: bol sekmeli rapor sayfası. Şimdilik tek sekme: Alacak/Borç Raporu.
const SEKMELER = [{ id: 'alacakborc', ad: 'Alacak / Borç Raporu' }];
const YENILE_MS = 30000;

function Liste({ tur, baslik, alt, toplam, turler, satirlar, arama }) {
  const liste = useMemo(() => {
    const q = trNorm(arama);
    return q ? satirlar.filter((r) => trNorm(r.ad).includes(q)) : satirlar;
  }, [satirlar, arama]);
  return (
    <section className={`kr-liste kr-${tur}`}>
      <div className="kr-lbas">
        <div>
          <h2>{baslik}</h2>
          <p>{alt}</p>
        </div>
        <b className="kr-ltop">{kurus(toplam)} ₺</b>
      </div>
      {turler.length > 1 && (
        <div className="kr-etiketler">
          {turler.map((t) => (
            <span key={t.tur}>
              {t.tur} <b>{kurus(t.tutar)}</b>
            </span>
          ))}
        </div>
      )}
      <div className="kr-satirlar">
        {liste.length === 0 ? (
          <div className="kr-bos">{satirlar.length === 0 ? 'Kayıt yok' : 'Aramayla eşleşen yok'}</div>
        ) : (
          liste.map((r, i) => (
            <div className="kr-satir" key={r.id}>
              <span className="kr-sira">{i + 1}</span>
              <div className="kr-ad">
                <strong>{r.ad}</strong>
                <small>
                  {r.tur}
                  {r.sonIslem ? ` · son işlem ${tarihKisa(r.sonIslem)}` : ''}
                </small>
                <i style={{ width: `${Math.max(3, (r.tutar / (satirlar[0]?.tutar || 1)) * 100)}%` }} />
              </div>
              <span className="kr-tutar">{kurus(r.tutar)}</span>
              <span className="kr-yuzde">%{toplam ? Math.round((r.tutar / toplam) * 100) : 0}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default function KasaRapor({ onNavigate }) {
  const [sekme, setSekme] = useState('alacakborc');
  const [veri, setVeri] = useState(null); // { satirlar, zaman }
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [gizli, setGizli] = useState(() => new Set());
  const [arama, setArama] = useState('');
  const [paylasAcik, setPaylasAcik] = useState(false);
  const sonYukleme = useRef(0);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const res = await fetch('/api/muhasebe2?resource=alacakBorcRaporu');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Yüklenemedi');
      setVeri(j);
      setHata('');
      sonYukleme.current = Date.now();
    } catch (e) {
      setHata(e.message || 'Yüklenemedi');
    } finally {
      setYukleniyor(false);
    }
  }, []);

  // Açılışta yükle; sonra 30 sn'de bir ve sekmeye/pencereye dönülünce tazele (fiş/fatura girildikçe rakamlar güncel kalır).
  useEffect(() => {
    yukle();
    const t = setInterval(() => { if (!document.hidden) yukle(); }, YENILE_MS);
    const gorunur = () => { if (!document.hidden && Date.now() - sonYukleme.current > 5000) yukle(); };
    document.addEventListener('visibilitychange', gorunur);
    window.addEventListener('focus', gorunur);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', gorunur);
      window.removeEventListener('focus', gorunur);
    };
  }, [yukle]);

  const turler = useMemo(() => {
    const set = new Set((veri?.satirlar || []).map((r) => r.tur));
    return [...set].sort((a, b) => {
      const ia = TUR_SIRA.indexOf(a);
      const ib = TUR_SIRA.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [veri]);

  const r = useMemo(() => raporHesapla(veri?.satirlar || [], gizli), [veri, gizli]);
  const kapaliTurler = turler.filter((t) => gizli.has(t));
  const degistir = (t) => setGizli((onceki) => { const y = new Set(onceki); if (y.has(t)) y.delete(t); else y.add(t); return y; });

  const farkSinif = Math.abs(r.fark) < 0.005 ? 'kr-notr' : r.fark < 0 ? 'kr-eksi' : 'kr-arti';

  return (
    <div className="kr-shell">
      <header className="kr-ust">
        <button type="button" className="kr-geri" onClick={() => onNavigate('settings')} aria-label="Geri">
          <ArrowLeft size={20} />
        </button>
        <h1>Kasa &amp; Rapor</h1>
        <nav className="kr-sekmeler">
          {SEKMELER.map((s) => (
            <button key={s.id} type="button" className={sekme === s.id ? 'on' : ''} onClick={() => setSekme(s.id)}>
              {s.ad}
            </button>
          ))}
        </nav>
        <span className="kr-bosluk" />
        {veri && <span className="kr-zaman">Güncellendi {saatYaz(veri.zaman)}</span>}
        <button type="button" className="kr-btn" onClick={yukle} disabled={yukleniyor}>
          <RefreshCw size={17} className={yukleniyor ? 'kr-don' : ''} />
          <span>Yenile</span>
        </button>
        <button type="button" className="kr-btn kr-ana" onClick={() => setPaylasAcik(true)} disabled={!veri}>
          <ImageIcon size={17} />
          <span>PNG</span>
        </button>
      </header>

      {hata && <div className="kr-hata">{hata}</div>}

      {sekme === 'alacakborc' && (
        <main className="kr-govde">
          <section className="kr-kpiler">
            <div className="kr-kpi kr-borc">
              <span>BORÇLARIMIZ <em>ödeyeceğimiz</em></span>
              <b>{kurus(r.borcToplam)} ₺</b>
              <small>{r.borclar.length} kişi / kurum</small>
            </div>
            <div className="kr-kpi kr-alacak">
              <span>ALACAKLARIMIZ <em>tahsil edeceğimiz</em></span>
              <b>{kurus(r.alacakToplam)} ₺</b>
              <small>{r.alacaklar.length} kişi / kurum</small>
            </div>
            <div className={`kr-kpi kr-fark ${farkSinif}`}>
              <span>{farkEtiketi(r.fark)} <em>alacak − borç</em></span>
              <b>{r.fark < 0 ? '−' : r.fark > 0 ? '+' : ''}{kurus(Math.abs(r.fark))} ₺</b>
              <small>{kapaliTurler.length ? `Hariç: ${kapaliTurler.join(', ')}` : 'Tüm cariler dahil'}</small>
            </div>
          </section>

          <section className="kr-filtre">
            <div className="kr-chipler">
              {turler.map((t) => (
                <button key={t} type="button" className={gizli.has(t) ? '' : 'on'} onClick={() => degistir(t)} aria-pressed={!gizli.has(t)}>
                  {t}
                </button>
              ))}
            </div>
            <label className="kr-ara">
              <Search size={17} />
              <input type="search" placeholder="Cari ara…" value={arama} onChange={(e) => setArama(e.target.value)} />
            </label>
          </section>

          {!veri && !hata ? (
            <div className="kr-bos kr-yuk">Yükleniyor…</div>
          ) : (
            <div className="kr-listeler">
              <Liste tur="borc" baslik="Borçlarımız" alt="Alacaklı olduğumuz değil, ÖDEMEMİZ gerekenler" toplam={r.borcToplam} turler={r.borcTurler} satirlar={r.borclar} arama={arama} />
              <Liste tur="alacak" baslik="Alacaklarımız" alt="TAHSİL EDECEKLERİMİZ (bize borçlu olanlar)" toplam={r.alacakToplam} turler={r.alacakTurler} satirlar={r.alacaklar} arama={arama} />
            </div>
          )}
        </main>
      )}

      {paylasAcik && veri && (
        <RaporPaylas rapor={r} zaman={veri.zaman} kapaliTurler={kapaliTurler} onKapat={() => setPaylasAcik(false)} />
      )}
    </div>
  );
}
