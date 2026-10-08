import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Copy, Check, Download, Share2, X, AlertTriangle } from 'lucide-react';
import { tam, kurus, buyukHarf } from './gunsonuPaylasVeri';
import './GunSonuPaylas.css';

// Gün sonu paylaşım görseli: "takvim yaprağı". Ekranda görünmeyen 1080 px genişliğinde ayrı bir kart çizilir,
// PNG'ye çevrilir; ekran genişliğinden bağımsızdır. Görsel aşağı doğru uzayabilir, genişlemez.

function Satir({ ad, tutar, son }) {
  return (
    <div className={`gsk-s${son ? ' gsk-son' : ''}`}>
      <span className="gsk-ad">{ad}</span>
      <span className={tutar < 0 ? 'gsk-n' : ''}>{tam(tutar)}</span>
    </div>
  );
}

function Bolum({ tur, baslik, toplam, children, negatif }) {
  return (
    <section className={`gsk-b gsk-t-${tur}`}>
      <div className="gsk-bh">
        <span><i className="gsk-nokta" />{buyukHarf(baslik)}</span>
        {toplam !== undefined && <b className={negatif ? 'gsk-n' : ''}>{toplam}</b>}
      </div>
      {children}
    </section>
  );
}

function HarcamaSutun({ baslik, veri }) {
  return (
    <div className="gsk-hs">
      <div className="gsk-ab">{buyukHarf(baslik)}</div>
      {veri.satirlar.length ? veri.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />) : <div className="gsk-bos">Harcama yok</div>}
      <Satir ad="Toplam" tutar={veri.toplam} son />
    </div>
  );
}

export function PaylasKarti({ v }) {
  const { tarih, ay, nakit, kart, yemek, cari, harcama, anaKasa, ekmek } = v;
  const harcamaVar = harcama.tlKasa.satirlar.length || harcama.gunluk.satirlar.length;
  const kirilim = yemek.kolonlar.length > 1;
  return (
    <div className="gsk">
      <div className="gsk-delik" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} />)}</div>
      <header className="gsk-bas">
        <div className="gsk-yaprak">
          <div className="gsk-ay">{buyukHarf(tarih.ay)} {tarih.yil}</div>
          <div className="gsk-gun">{tarih.gun}</div>
        </div>
        <div className="gsk-ciro">
          <div className="gsk-et">TOPLAM CİRO</div>
          <div className="gsk-ciro-t">{kurus(v.toplamCiro)} ₺</div>
          <div className="gsk-ay1">Bu ay {tam(ay.buAy)} ₺ · Geçen ay {tam(ay.gecenAy)} ₺</div>
          {ay.ayniGune > 0 && (
            <div className="gsk-ay2">
              Geçen ay aynı güne {tam(ay.ayniGune)} ₺{' '}
              <b className={ay.yuzde >= 0 ? 'gsk-art' : 'gsk-n'}>{ay.yuzde >= 0 ? '+' : '−'}%{Math.abs(ay.yuzde)}</b>
            </div>
          )}
        </div>
      </header>

      <div className="gsk-iki">
        <Bolum tur="nakit" baslik="Nakit" toplam={tam(nakit.toplam)} negatif={nakit.toplam < 0}>
          {nakit.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}
        </Bolum>
        <div>
          <Bolum tur="kart" baslik="Kredi kartı" toplam={tam(kart.toplam)}>
            {kart.satirlar.length ? kart.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />) : <div className="gsk-bos">Kart satışı yok</div>}
          </Bolum>
          <Bolum tur="kasa" baslik="Ana kasa" toplam={tam(anaKasa.yarinaDevir)} negatif={anaKasa.yarinaDevir < 0}>
            {anaKasa.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}
            <Satir ad="Yarına devir" tutar={anaKasa.yarinaDevir} son />
          </Bolum>
        </div>
      </div>

      {yemek.satirlar.length > 0 && (
        <Bolum tur="yemek" baslik="Yemek kartı" toplam={tam(yemek.toplam)}>
          {kirilim ? (
            <div className="gsk-tab" style={{ gridTemplateColumns: `minmax(0, 1.25fr) repeat(${yemek.kolonlar.length}, minmax(0, 1fr)) minmax(0, 0.9fr)` }}>
              <span className="gsk-th" />
              {yemek.kolonlar.map((k) => <span key={k} className="gsk-th gsk-sag">{k}</span>)}
              <span className="gsk-th gsk-sag">Toplam</span>
              {yemek.satirlar.map((r) => [
                <span key={`${r.ad}-a`} className="gsk-td gsk-ad">{r.ad}</span>,
                ...r.parcalar.map((p, i) => <span key={`${r.ad}-${i}`} className={`gsk-td gsk-sag${p ? '' : ' gsk-silik'}`}>{p ? tam(p) : '–'}</span>),
                <span key={`${r.ad}-t`} className="gsk-td gsk-sag gsk-kalin">{tam(r.tutar)}</span>,
              ])}
            </div>
          ) : (
            yemek.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)
          )}
        </Bolum>
      )}

      {cari.satirlar.length > 0 && (
        <Bolum tur="cari" baslik="Cari" toplam={tam(cari.toplam)} negatif={cari.toplam < 0}>
          <div className={`gsk-cari-l${cari.tekSutun ? ' gsk-tek' : ''}`}>
            {cari.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}
          </div>
        </Bolum>
      )}

      {harcamaVar ? (
        <Bolum tur="harcama" baslik="Harcama">
          <div className="gsk-harcama-l">
            <HarcamaSutun baslik="TL Kasa" veri={harcama.tlKasa} />
            <HarcamaSutun baslik="Günlük kasa" veri={harcama.gunluk} />
          </div>
        </Bolum>
      ) : null}

      <Bolum tur="ekmek" baslik="Ekmek" toplam={`${ekmek.toplam} adet`}>
        <div className="gsk-ekmek-l">
          {ekmek.satirlar.map((e) => (
            <div key={e.ad}><b>{e.adet}</b><span>{e.ad}</span></div>
          ))}
        </div>
      </Bolum>

      {!v.kaydedildi && <div className="gsk-not">Kaydedilmemiş taslak</div>}
    </div>
  );
}

export default function GunSonuPaylas({ v, onKapat }) {
  const kartRef = useRef(null);
  const [png, setPng] = useState(null); // { blob, url }
  const [hata, setHata] = useState('');
  const [kopyalandi, setKopyalandi] = useState(false);
  const dosyaAdi = `gunsonu-${v.tarih.iso}.png`;
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
  }, [v]);

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
      <div className="gsp-pen" role="dialog" aria-modal="true" aria-label="Gün sonu görseli" onClick={(e) => e.stopPropagation()}>
        <div className="gsp-bas">
          <h3>Gün sonu görseli</h3>
          <button type="button" className="gsp-x" aria-label="Kapat" onClick={onKapat}><X size={18} /></button>
        </div>
        {!v.kaydedildi && (
          <div className="gsp-uyari"><AlertTriangle size={15} /><span>Gün sonu kaydedilmedi. Görseldeki rakamlar ekrandaki taslaktan.</span></div>
        )}
        <div className="gsp-onizleme">
          {png ? <img src={png.url} alt={`${v.tarih.gun} ${v.tarih.ay} ${v.tarih.yil} gün sonu görseli`} /> : !hata && <div className="gsp-bekle">Görsel hazırlanıyor...</div>}
        </div>
        {hata && <div className="gsp-hata">{hata}</div>}
        <div className="gsp-dugmeler">
          <button type="button" className="gsp-btn gsp-ana" onClick={kopyala} disabled={!png}>
            {kopyalandi ? <Check size={16} /> : <Copy size={16} />}{kopyalandi ? 'Kopyalandı' : 'PNG Kopyala'}
          </button>
          <button type="button" className="gsp-btn" onClick={indir} disabled={!png}><Download size={16} />İndir</button>
          {paylasilabilir && <button type="button" className="gsp-btn" onClick={paylas} disabled={!png}><Share2 size={16} />Paylaş</button>}
        </div>
        <div className="gsp-sahne" aria-hidden="true"><div ref={kartRef}><PaylasKarti v={v} /></div></div>
      </div>
    </div>
  );
}