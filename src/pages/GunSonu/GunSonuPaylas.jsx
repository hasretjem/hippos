import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Copy, Check, Download, Share2, X, AlertTriangle } from 'lucide-react';
import '@fontsource/archivo-black/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import { tam, buyukHarf } from './gunsonuPaylasVeri';
import './GunSonuPaylas.css';

// Gün sonu paylaşım görseli: HER ZAMAN 1080 x 2400 px (sabit boyut).
// WhatsApp uzun görselleri sohbette kırpar ve görünen pencere görselin yüksekliğine göre değişir; bu yüzden
// boyut sabit tutulur. Tarih ve ciro görselin y=430-830 bandında (WhatsApp'ta kırpılmadan görünen bölge),
// ayrıntılar bunun üstünde ve altında; görsele tıklayınca tamamı görünür.
// Detay bölgesi taşarsa --k değişkeni küçülerek yazılar sığdırılır, görsel boyutu değişmez.

export const KART_YUKSEKLIK = 2400;

function Satir({ ad, tutar, son }) {
  return (
    <div className={`gsk-s${son ? ' gsk-son' : ''}`}>
      <span className="gsk-ad">{ad}</span>
      <b className={tutar < 0 ? 'gsk-n' : ''}>{tam(tutar)}</b>
    </div>
  );
}

function Kutu({ baslik, children, sinif = '' }) {
  return (
    <section className={`gsk-kt ${sinif}`}>
      <h3>{buyukHarf(baslik)}</h3>
      {children}
    </section>
  );
}

export function PaylasKarti({ v }) {
  const { tarih, ay, nakit, kart, yemek, cari, harcama, anaKasa, ekmek } = v;
  const harcamaSatir = [
    ...harcama.tlKasa.satirlar.map((s) => ({ ...s, ad: `${s.ad} (TL kasa)` })),
    ...harcama.gunluk.satirlar.map((s) => ({ ...s, ad: `${s.ad} (günlük)` })),
  ];
  const harcamaToplam = harcamaSatir.reduce((t, r) => t + r.tutar, 0);
  const kirilim = yemek.kolonlar.length > 1;
  const renkler = [
    ['nakit', 'NAKİT', nakit.toplam],
    ['kart', 'KREDİ KARTI', kart.toplam],
    ['yemek', 'YEMEK KARTI', yemek.toplam],
    ['cari', 'CARİ', cari.toplam],
  ];
  return (
    <div className="gsk" style={{ height: KART_YUKSEKLIK }}>
      <div className="gsk-band">
        <span>PERPA SANDVİÇ</span>
        <small>{v.kaydedildi ? 'GÜN SONU · DETAYLAR' : 'TASLAK · KAYDEDİLMEDİ'}</small>
      </div>
      <div className="gsk-ic">
        <div className="gsk-ust">
          <Kutu baslik="Kredi kartı">
            {kart.satirlar.length ? kart.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />) : <div className="gsk-bos">Kart satışı yok</div>}
            <Satir ad="Toplam" tutar={kart.toplam} son />
          </Kutu>
          <Kutu baslik="Ana kasa">
            {anaKasa.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}
            <Satir ad="Yarına devir" tutar={anaKasa.yarinaDevir} son />
          </Kutu>
        </div>

        <div className="gsk-hero">
          <div className="gsk-dt">{buyukHarf(tarih.haftaGunu)} · {parseInt(tarih.gun, 10)} {buyukHarf(tarih.ay)} {tarih.yil}</div>
          <div className="gsk-et">TOPLAM CİRO</div>
          <div className="gsk-big">{tam(v.toplamCiro)}<i> ₺</i></div>
          <div className="gsk-ayrow">
            <em>BU AY {tam(ay.buAy)} ₺</em>
            {ay.ayniGune > 0 && <em className="gsk-em2">GEÇEN AY AYNI GÜNE {tam(ay.ayniGune)} ₺ <b className={ay.yuzde >= 0 ? 'gsk-art' : 'gsk-nn'}>{ay.yuzde >= 0 ? '+' : '−'}%{Math.abs(ay.yuzde)}</b></em>}
          </div>
        </div>

        <div className="gsk-tiles">
          {renkler.map(([t, ad, tutar]) => (
            <div key={t} className={`gsk-tile gsk-tl-${t}`}><span>{ad}</span><b>{tam(tutar)}</b></div>
          ))}
        </div>

        <div className="gsk-alt">
          <div className="gsk-iki">
            <Kutu baslik="Nakit sayımı">
              {nakit.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}
              <Satir ad="Toplam" tutar={nakit.toplam} son />
            </Kutu>
            <div className="gsk-sutun">
              {harcamaSatir.length > 0 && (
                <Kutu baslik="Harcama">
                  {harcamaSatir.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}
                  <Satir ad="Toplam" tutar={harcamaToplam} son />
                </Kutu>
              )}
              <Kutu baslik="Ekmek">
                <div className="gsk-ekmek">
                  {ekmek.satirlar.map((e) => <div key={e.ad}><b>{e.adet}</b><span>{e.ad}</span></div>)}
                </div>
                <Satir ad="Toplam ekmek" tutar={ekmek.toplam} son />
              </Kutu>
            </div>
          </div>

          {yemek.satirlar.length > 0 && (
            <Kutu baslik="Yemek kartı">
              {kirilim ? (
                <div className="gsk-tab" style={{ gridTemplateColumns: `minmax(0, 1.25fr) repeat(${yemek.kolonlar.length}, minmax(0, 1fr)) minmax(0, 0.9fr)` }}>
                  <span className="gsk-th" />
                  {yemek.kolonlar.map((k) => <span key={k} className="gsk-th gsk-sag">{k}</span>)}
                  <span className="gsk-th gsk-sag">Toplam</span>
                  {yemek.satirlar.map((r) => [
                    <span key={`${r.ad}-a`} className="gsk-td">{r.ad}</span>,
                    ...r.parcalar.map((p, i) => <span key={`${r.ad}-${i}`} className={`gsk-td gsk-sag${p ? '' : ' gsk-silik'}`}>{p ? tam(p) : '–'}</span>),
                    <span key={`${r.ad}-t`} className="gsk-td gsk-sag gsk-kalin">{tam(r.tutar)}</span>,
                  ])}
                  <span className="gsk-td gsk-tt">Toplam</span>
                  {yemek.kolonlar.map((k, i) => <span key={k} className="gsk-td gsk-sag gsk-tt">{tam(yemek.satirlar.reduce((a, r) => a + r.parcalar[i], 0))}</span>)}
                  <span className="gsk-td gsk-sag gsk-tt">{tam(yemek.toplam)}</span>
                </div>
              ) : (
                <>
                  <div className="gsk-cl">{yemek.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}</div>
                  <Satir ad="Toplam" tutar={yemek.toplam} son />
                </>
              )}
            </Kutu>
          )}


          {cari.satirlar.length > 0 && (
            <Kutu baslik="Cari">
              <div className={`gsk-cl${cari.tekSutun ? ' gsk-tek' : ''}`}>
                {cari.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}
              </div>
              <Satir ad="Cari toplamı" tutar={cari.toplam} son />
            </Kutu>
          )}
        </div>
      </div>
    </div>
  );
}

// Detay bölgesi 2400 px'e sığmıyorsa yazıları küçült (görsel boyutu sabit kalır).
function sigdir(kart) {
  const ic = kart.querySelector('.gsk-ic');
  const alt = kart.querySelector('.gsk-alt');
  const bant = kart.querySelector('.gsk-band');
  if (!ic || !alt || !bant) return;
  const sinir = KART_YUKSEKLIK - 14;
  let k = 1;
  alt.style.setProperty('--k', '1');
  while (bant.offsetHeight + ic.offsetHeight > sinir && k > 0.5) {
    k = Math.round((k - 0.04) * 100) / 100;
    alt.style.setProperty('--k', String(k));
  }
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
        if (document.fonts) {
          await Promise.all([document.fonts.load("40px 'Archivo Black'"), document.fonts.load("700 40px 'Space Grotesk'"), document.fonts.load("500 40px 'Space Grotesk'")]).catch(() => {});
          await document.fonts.ready;
        }
        sigdir(kartRef.current);
        const canvas = await html2canvas(kartRef.current, { scale: 1, backgroundColor: null, useCORS: true, logging: false, width: 1080, height: KART_YUKSEKLIK, windowWidth: 1080 });
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
    try { await navigator.share({ files: [dosya], text: `${v.tarih.gun} ${v.tarih.ay} ${v.tarih.haftaGunu} · Ciro ${tam(v.toplamCiro)} ₺` }); } catch { /* kullanıcı vazgeçti */ }
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