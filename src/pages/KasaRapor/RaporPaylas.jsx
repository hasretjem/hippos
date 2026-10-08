import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Copy, Check, Download, Share2, X } from 'lucide-react';
import { kurus, farkEtiketi, saatYaz } from './raporVeri';
import '../GunSonu/GunSonuPaylas.css';
import './RaporPaylas.css';

// Alacak/Borç görseli: ekranda görünmeyen 1080 px genişliğinde kart çizilir, PNG'ye çevrilir (WhatsApp için).
// Liste uzadıkça görsel aşağı uzar, genişlemez.

function Kolon({ tur, baslik, toplam, satirlar }) {
  return (
    <div className={`rk-kol rk-${tur}`}>
      <div className="rk-kb">
        <span>{baslik}</span>
        <b>{kurus(toplam)}</b>
      </div>
      {satirlar.length === 0 && <div className="rk-bos">Kayıt yok</div>}
      {satirlar.map((s) => (
        <div className="rk-s" key={s.id}>
          <span className="rk-ad">{s.ad}</span>
          <span className="rk-t">{kurus(s.tutar)}</span>
        </div>
      ))}
    </div>
  );
}

function RaporKarti({ rapor, zaman, kapaliTurler }) {
  const { fark } = rapor;
  const sinif = Math.abs(fark) < 0.005 ? 'rk-notr' : fark < 0 ? 'rk-eksi' : 'rk-arti';
  return (
    <div className="rk">
      <header className="rk-bas">
        <h1>ALACAK / BORÇ RAPORU</h1>
        <span>{saatYaz(zaman)}</span>
      </header>
      <div className="rk-kpi">
        <div className="rk-k rk-borc"><span>BORÇLARIMIZ</span><b>{kurus(rapor.borcToplam)} ₺</b></div>
        <div className="rk-k rk-alacak"><span>ALACAKLARIMIZ</span><b>{kurus(rapor.alacakToplam)} ₺</b></div>
        <div className={`rk-k rk-fark ${sinif}`}>
          <span>{farkEtiketi(fark)}</span>
          <b>{fark < 0 ? '−' : fark > 0 ? '+' : ''}{kurus(Math.abs(fark))} ₺</b>
        </div>
      </div>
      <div className="rk-iki">
        <Kolon tur="borc" baslik="BORÇLARIMIZ (ödeyeceğimiz)" toplam={rapor.borcToplam} satirlar={rapor.borclar} />
        <Kolon tur="alacak" baslik="ALACAKLARIMIZ (tahsil edeceğimiz)" toplam={rapor.alacakToplam} satirlar={rapor.alacaklar} />
      </div>
      {kapaliTurler.length > 0 && <div className="rk-not">Hariç tutulan: {kapaliTurler.join(', ')}</div>}
    </div>
  );
}

export default function RaporPaylas({ rapor, zaman, kapaliTurler, onKapat }) {
  const kartRef = useRef(null);
  const [png, setPng] = useState(null);
  const [hata, setHata] = useState('');
  const [kopyalandi, setKopyalandi] = useState(false);
  const dosyaAdi = `alacak-borc-${new Date(zaman).toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })}.png`;
  const paylasilabilir = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;

  useEffect(() => {
    let iptal = false;
    let url = null;
    setPng(null);
    setHata('');
    (async () => {
      try {
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const canvas = await html2canvas(kartRef.current, { scale: 1, backgroundColor: null, useCORS: true, logging: false });
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('bos');
        url = URL.createObjectURL(blob);
        if (!iptal) setPng({ blob, url });
      } catch {
        if (!iptal) setHata('Görsel oluşturulamadı. Sayfayı yenileyip tekrar dene.');
      }
    })();
    return () => { iptal = true; if (url) URL.revokeObjectURL(url); };
  }, [rapor, zaman, kapaliTurler]);

  useEffect(() => {
    const tus = (e) => { if (e.key === 'Escape') onKapat(); };
    window.addEventListener('keydown', tus);
    return () => window.removeEventListener('keydown', tus);
  }, [onKapat]);

  async function kopyala() {
    if (!png) return;
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('yok');
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': png.blob })]);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      setHata('Bu tarayıcı görseli panoya kopyalayamıyor. İndir ile kaydedip gönderebilirsin.');
    }
  }
  function indir() {
    if (!png) return;
    const a = document.createElement('a');
    a.href = png.url;
    a.download = dosyaAdi;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  async function paylas() {
    if (!png) return;
    const dosya = new File([png.blob], dosyaAdi, { type: 'image/png' });
    if (!navigator.canShare({ files: [dosya] })) { setHata('Bu cihaz dosya paylaşımını desteklemiyor. İndir ile kaydet.'); return; }
    try { await navigator.share({ files: [dosya] }); } catch { /* kullanıcı vazgeçti */ }
  }

  return (
    <div className="gsp-ort" onClick={onKapat}>
      <div className="gsp-pen" role="dialog" aria-modal="true" aria-label="Alacak borç görseli" onClick={(e) => e.stopPropagation()}>
        <div className="gsp-bas">
          <h3>Alacak / Borç görseli</h3>
          <button type="button" className="gsp-x" aria-label="Kapat" onClick={onKapat}><X size={18} /></button>
        </div>
        <div className="gsp-onizleme">
          {png ? <img src={png.url} alt="Alacak borç raporu görseli" /> : !hata && <div className="gsp-bekle">Görsel hazırlanıyor...</div>}
        </div>
        {hata && <div className="gsp-hata">{hata}</div>}
        <div className="gsp-dugmeler">
          <button type="button" className="gsp-btn gsp-ana" onClick={kopyala} disabled={!png}>
            {kopyalandi ? <Check size={16} /> : <Copy size={16} />}{kopyalandi ? 'Kopyalandı' : 'PNG Kopyala'}
          </button>
          <button type="button" className="gsp-btn" onClick={indir} disabled={!png}><Download size={16} />İndir</button>
          {paylasilabilir && <button type="button" className="gsp-btn" onClick={paylas} disabled={!png}><Share2 size={16} />Paylaş</button>}
        </div>
        <div className="gsp-sahne" aria-hidden="true"><div ref={kartRef}><RaporKarti rapor={rapor} zaman={zaman} kapaliTurler={kapaliTurler} /></div></div>
      </div>
    </div>
  );
}
