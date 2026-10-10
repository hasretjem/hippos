import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Copy, Check, Download, Share2, X, AlertTriangle } from 'lucide-react';
import '@fontsource/archivo-black/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import { tam, buyukHarf } from './gunsonuPaylasVeri';
import './GunSonuPaylas.css';

// Gün sonu paylaşım görseli: HER ZAMAN 1080 x 2400 px (sabit boyut).
// WhatsApp uzun görselleri sohbette kırpar; görünen pencere yaklaşık y=320..1790. Bu yüzden her bölüm SABİT konum ve
// yükseklikte: kalın çerçevenin içi (pencere) özet bilgiler, dışı (yukarıda yemek kartı, aşağıda harcama/cari) ayrıntı.
// Bilgi artarsa yalnızca o kutunun yazısı küçülür (--k), görsel boyutu ve kutu yerleri değişmez.

export const KART_YUKSEKLIK = 2400;

function Satir({ ad, tutar, son, bos }) {
  return (
    <div className={`gsk-s${son ? ' gsk-son' : ''}${bos ? ' gsk-bossatir' : ''}`}>
      <span className="gsk-ad">{ad}</span>
      <b className={tutar < 0 ? 'gsk-n' : ''}>{bos ? '—' : tam(tutar)}</b>
    </div>
  );
}

function Kutu({ baslik, children, sinif = '' }) {
  return (
    <section className={`gsk-kt gsk-fit ${sinif}`}>
      <h3>{buyukHarf(baslik)}</h3>
      {children}
    </section>
  );
}

export function PaylasKarti({ v }) {
  const { tarih, ay, nakit, kart, yemek, harcama, anaKasa, ekmek, cari, cariTahsilat } = v;
  const harcamaSatir = [
    ...harcama.tlKasa.satirlar.map((s) => ({ ...s, ad: `${s.ad} (kasa)` })),
    ...harcama.gunluk.satirlar.map((s) => ({ ...s, ad: `${s.ad} (günlük)` })),
  ];
  const harcamaToplam = harcamaSatir.reduce((t, r) => t + r.tutar, 0);
  const kirilim = yemek.kolonlar.length > 1;
  const sablon = `minmax(0, 1.25fr) repeat(${yemek.kolonlar.length}, minmax(0, 1fr)) minmax(0, 0.9fr)`;
  const renkler = [
    ['nakit', 'NAKİT', nakit.toplam, 'gsk-t1'],
    ['kart', 'KREDİ KARTI', kart.toplam, 'gsk-t2'],
    ['yemek', 'YEMEK KARTI', yemek.toplam, 'gsk-t3'],
    ['cari', 'CARİ', v.cariGenel, 'gsk-t4'],
  ];
  const ayDeger = (n) => (n > 0 ? tam(n) : '—');
  return (
    <div className="gsk" style={{ height: KART_YUKSEKLIK }}>
      {/* Üst gizli bölge: yemek kartı (sabit uzunlukta) */}
      <section className="gsk-kt gsk-fit gsk-yemek">
        {kirilim ? (
          <div className="gsk-ytab">
            <div className="gsk-ygrid" style={{ gridTemplateColumns: sablon }}>
              <span className="gsk-yh gsk-yb">YEMEK KARTI</span>
              {yemek.kolonlar.map((k) => <span key={k} className="gsk-yh gsk-sag">{k}</span>)}
              <span className="gsk-yh gsk-sag">Toplam</span>
              {yemek.satirlar.map((r) => [
                <span key={`${r.ad}-a`} className="gsk-td">{r.ad}</span>,
                ...r.parcalar.map((p, i) => <span key={`${r.ad}-${i}`} className={`gsk-td gsk-sag${p ? '' : ' gsk-silik'}`}>{p ? tam(p) : '–'}</span>),
                <span key={`${r.ad}-t`} className="gsk-td gsk-sag gsk-kalin">{tam(r.tutar)}</span>,
              ])}
            </div>
            <div className="gsk-ygrid gsk-ytop" style={{ gridTemplateColumns: sablon }}>
              <span className="gsk-td gsk-tt">Toplam</span>
              {yemek.kolonlar.map((k, i) => <span key={k} className="gsk-td gsk-sag gsk-tt">{tam(yemek.satirlar.reduce((a, r) => a + r.parcalar[i], 0))}</span>)}
              <span className="gsk-td gsk-sag gsk-tt">{tam(yemek.toplam)}</span>
            </div>
          </div>
        ) : (
          <div className="gsk-ytab">
            <div className="gsk-ygrid" style={{ gridTemplateColumns: '1fr auto' }}>
              <span className="gsk-yh gsk-yb">YEMEK KARTI</span><span className="gsk-yh" />
              {yemek.satirlar.map((r) => [<span key={`${r.ad}-a`} className="gsk-td">{r.ad}</span>, <span key={`${r.ad}-t`} className="gsk-td gsk-sag gsk-kalin">{tam(r.tutar)}</span>])}
            </div>
            <div className="gsk-ygrid gsk-ytop" style={{ gridTemplateColumns: '1fr auto' }}>
              <span className="gsk-td gsk-tt">Toplam</span><span className="gsk-td gsk-sag gsk-tt">{tam(yemek.toplam)}</span>
            </div>
          </div>
        )}
      </section>

      {/* Görünen pencere: kalın çerçeve */}
      <div className="gsk-cerceve" />
      <div className="gsk-tab gsk-tab-ust">▲ YEMEK KARTI ▲</div>
      <div className="gsk-tab gsk-tab-alt">▼ HARCAMA · CARİ ▼</div>

      <div className="gsk-hero">
        {!v.kaydedildi && <div className="gsk-taslak">TASLAK</div>}
        <div className="gsk-dt">{buyukHarf(tarih.haftaGunu)} · {parseInt(tarih.gun, 10)} {buyukHarf(tarih.ay)}</div>
        <div className="gsk-et">TOPLAM CİRO</div>
        <div className="gsk-big">{tam(v.toplamCiro)}<i> ₺</i></div>
        <div className="gsk-ay">
          <div className="gsk-ar"><span>BU AY</span><b>{ayDeger(ay.buAy)}</b></div>
          <div className="gsk-ar"><span>GEÇEN AY 1–{ay.gun}</span><b className="gsk-k">{ayDeger(ay.ayniGune)}</b></div>
          <div className="gsk-ar"><span>GEÇEN AY TAMAMI</span><b className="gsk-k">{ayDeger(ay.gecenAy)}</b></div>
        </div>
      </div>

      {renkler.map(([t, ad, tutar, sinif]) => (
        <div key={t} className={`gsk-tile ${sinif}`}><span>{ad}</span><b>{tam(tutar)}</b></div>
      ))}

      <Kutu baslik="Nakit sayımı" sinif="gsk-b-nakit">
        {nakit.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} bos={s.bos} />)}
        <Satir ad="Toplam" tutar={nakit.toplam} son />
      </Kutu>
      <Kutu baslik="Kredi kartı" sinif="gsk-b-kart">
        {kart.satirlar.length ? kart.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />) : <div className="gsk-bos">Kart satışı yok</div>}
        <Satir ad="Toplam" tutar={kart.toplam} son />
      </Kutu>
      <Kutu baslik="Ana kasa" sinif="gsk-b-ana">
        {anaKasa.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}
        <Satir ad="Yarına devir" tutar={anaKasa.yarinaDevir} son />
      </Kutu>

      <Kutu baslik="Ekmek" sinif="gsk-b-ekmek">
        <div className="gsk-ekmek" style={{ gridTemplateColumns: `repeat(${ekmek.satirlar.length + 1}, 1fr)` }}>
          {ekmek.satirlar.map((e) => <div key={e.ad} className="gsk-eb"><b>{e.adet}</b><span>{e.ad}</span></div>)}
          <div className="gsk-eb gsk-et2"><b>{ekmek.toplam}</b><span>TOPLAM EKMEK</span></div>
        </div>
      </Kutu>

      {/* Alt gizli bölge */}
      <Kutu baslik="Harcama" sinif="gsk-b-harcama">
        {harcamaSatir.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}
        {harcamaSatir.length > 0 && <Satir ad="Toplam" tutar={harcamaToplam} son />}
      </Kutu>
      <Kutu baslik="Cari" sinif="gsk-b-cari">
        {cari.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}
        {cari.satirlar.length > 0 && <Satir ad="Cari toplamı" tutar={cari.toplam} son />}
      </Kutu>
      <Kutu baslik="Cari tahsilat" sinif="gsk-b-tahsilat">
        {cariTahsilat.satirlar.map((s, i) => <Satir key={i} ad={s.ad} tutar={s.tutar} />)}
        {cariTahsilat.satirlar.length > 0 && <Satir ad="Toplam" tutar={cariTahsilat.toplam} son />}
      </Kutu>
    </div>
  );
}

// Her kutu sabit boyutlu; içerik taşarsa (satır sayısı veya uzun isim) yalnızca o kutunun yazısı küçülür.
function sigdir(kart) {
  kart.querySelectorAll('.gsk-fit').forEach((kutu) => {
    let k = 1;
    kutu.style.setProperty('--k', '1');
    const tasti = () => {
      if (kutu.scrollHeight > kutu.clientHeight + 1) return true;
      return [...kutu.querySelectorAll('.gsk-ad, .gsk-td, .gsk-yh')].some((e) => e.scrollWidth > e.clientWidth + 1);
    };
    while (tasti() && k > 0.45) {
      k = Math.round((k - 0.04) * 100) / 100;
      kutu.style.setProperty('--k', String(k));
    }
  });
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