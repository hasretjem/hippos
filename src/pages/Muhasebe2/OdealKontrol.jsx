import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { Check, Copy, Download, FileUp, Link2, Share2, Trash2 } from 'lucide-react';
import '@fontsource/archivo-black/400.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/700.css';
import { ModalKabuk, TL, api, sayi, tarihTR, trNorm } from './m2Ortak';
import { xlsxOku } from './odealXlsx';
import { kontrolHesapla, odealSatirlari, tarihAraligi } from './odealHesap';
import './OdealKontrol.css';

// ---------------------------------------------------------------------------
// Ödeal Kontrol Aracı — YALNIZ KONTROL. Yüklenen Ödeal "Kart İşlemlerim" (.xlsx) dosyasını muhasebedeki Ödeal Kredi Kartı
// hareketleriyle karşılaştırır. Muhasebe kayıtlarına, ekstreye hiçbir şey yazmaz.
// Tek kalıcı şey: "Ödeal açıklaması -> firma" eşleme listesi (m2_odeal_eslemeleri), aracın kendi ezber listesidir.
// ---------------------------------------------------------------------------

const DURUM = {
  eslesti: { simge: '✅', etiket: 'Eşleşti', sinif: 'ok' },
  kayit_yok: { simge: '🟡', etiket: 'Kayıt yok', sinif: 'uyari' },
  odealda_yok: { simge: '🔴', etiket: "Ödeal'da yok", sinif: 'hata' },
};
const GELEN_DURUM = {
  tamam: { simge: '✅', etiket: 'Tutuyor', sinif: 'ok' },
  fark: { simge: '⚠️', etiket: 'Fark var', sinif: 'hata' },
  gelmedi: { simge: '🔴', etiket: 'Ödeal’a düşmemiş', sinif: 'hata' },
  gunsonu_yok: { simge: '❔', etiket: 'Günsonu kaydı yok', sinif: 'uyari' },
  bekleniyor: { simge: '⏳', etiket: 'Yarın gelecek', sinif: 'bek' },
};
const isaretli = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${TL(Math.abs(n))}`;

export default function OdealKontrolSekmesi({ aktif, bildir }) {
  const [dosya, setDosya] = useState(null); // { ad, satirlar, yoksayilan, bas, bit }
  const [veri, setVeri] = useState(null); // API cevabı
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [bakiye, setBakiye] = useState('');
  const [gorunum, setGorunum] = useState('giderler'); // giderler | firma
  const [yalnizSorun, setYalnizSorun] = useState(false);
  const [baglaModal, setBaglaModal] = useState(null); // { anahtar, aciklama }
  const [paylasAcik, setPaylasAcik] = useState(false);
  const [surukle, setSurukle] = useState(false);
  const girisRef = useRef(null);

  const apiYukle = useCallback(async (bas, bit) => {
    setVeri(await api('odealKontrol', { query: { bas, bit } }));
  }, []);

  async function dosyaSec(f) {
    if (!f) return;
    setHata('');
    setYukleniyor(true);
    try {
      if (!/\.xlsx$/i.test(f.name)) throw new Error('Lütfen Ödeal’dan indirdiğiniz .xlsx dosyasını seçin');
      const rows = await xlsxOku(await f.arrayBuffer());
      const { satirlar, yoksayilan } = odealSatirlari(rows);
      const { bas, bit } = tarihAraligi(satirlar);
      await apiYukle(bas, bit);
      setDosya({ ad: f.name, satirlar, yoksayilan, bas, bit });
    } catch (e) {
      setHata(e.message || 'Dosya okunamadı');
      setDosya(null);
      setVeri(null);
    } finally {
      setYukleniyor(false);
      if (girisRef.current) girisRef.current.value = '';
    }
  }

  const sonuc = useMemo(() => {
    if (!dosya || !veri) return null;
    return kontrolHesapla({
      satirlar: dosya.satirlar,
      muhasebe: veri.odemeler,
      posGunleri: veri.posGunleri,
      eslemeler: veri.eslemeler,
      firmalar: veri.firmalar,
      bas: dosya.bas,
      bit: dosya.bit,
    });
  }, [dosya, veri]);

  async function esle(anahtar, ornek, firmaId, firmaAdi) {
    try {
      await api('odealEsle', { method: 'POST', body: { anahtar, ornek, firmaId } });
      await apiYukle(dosya.bas, dosya.bit);
      setBaglaModal(null);
      bildir(`Kaydedildi: bu açıklama artık ${firmaAdi} firmasına bağlı`);
    } catch (e) {
      bildir(e.message, true);
    }
  }
  async function eslemeSil(anahtar) {
    try {
      await api('odealEslemeSil', { method: 'POST', body: { anahtar } });
      await apiYukle(dosya.bas, dosya.bit);
      bildir('Eşleme silindi');
    } catch (e) {
      bildir(e.message, true);
    }
  }

  const bakiyeGirilen = bakiye.trim() === '' ? null : sayi(bakiye);
  const bakiyeFark = bakiyeGirilen !== null && veri && veri.hipposBakiye !== null ? Math.round((bakiyeGirilen - veri.hipposBakiye) * 100) / 100 : null;

  const giderListe = useMemo(() => {
    if (!sonuc) return [];
    return yalnizSorun ? sonuc.giderler.filter((g) => g.durum !== 'eslesti' || g.provizyon) : sonuc.giderler;
  }, [sonuc, yalnizSorun]);

  const firmaAdiById = useMemo(() => new Map((veri?.firmalar || []).map((f) => [f.id, f.ad])), [veri]);
  const eslemeListe = veri?.eslemeler || [];

  return (
    <div className="ok-kok" style={{ display: aktif ? undefined : 'none' }}>
      <div className="m2-card ok-ust">
        <h2>Ödeal Kontrol Aracı</h2>
        <p className="ok-not">
          Ödeal’dan indirdiğiniz <b>Kart İşlemlerim (.xlsx)</b> dosyasını yükleyin. Dosya yalnızca bu ekranda okunur; muhasebe
          kayıtlarında ve ekstrede <b>hiçbir değişiklik yapılmaz</b>, sadece karşılaştırma gösterilir.
        </p>
        <div
          className={`ok-yukle ${surukle ? 'on' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setSurukle(true);
          }}
          onDragLeave={() => setSurukle(false)}
          onDrop={(e) => {
            e.preventDefault();
            setSurukle(false);
            dosyaSec(e.dataTransfer.files?.[0]);
          }}
          onClick={() => girisRef.current?.click()}
        >
          <FileUp size={26} />
          <div>
            <b>{yukleniyor ? 'Okunuyor…' : dosya ? dosya.ad : 'Dosyayı buraya bırakın ya da tıklayıp seçin'}</b>
            {dosya && (
              <small>
                {tarihTR(dosya.bas)} – {tarihTR(dosya.bit)} · {dosya.satirlar.length} satır
                {dosya.yoksayilan.length > 0 ? ` · ${dosya.yoksayilan.length} satır sayılmadı` : ''}
              </small>
            )}
          </div>
          <input ref={girisRef} type="file" accept=".xlsx" hidden onChange={(e) => dosyaSec(e.target.files?.[0])} />
        </div>
        {hata && <div className="m2-err">{hata}</div>}
      </div>

      {sonuc && (
        <>
          <div className="ok-kartlar">
            <div className="ok-kart">
              <span>Gelen (POS)</span>
              <b>{TL(sonuc.ozet.gelen)}</b>
            </div>
            <div className="ok-kart">
              <span>Giden (kesinleşen)</span>
              <b>{TL(sonuc.ozet.gidenBasarili)}</b>
            </div>
            <div className="ok-kart">
              <span>Bekleyen provizyon</span>
              <b>{TL(sonuc.ozet.gidenProvizyon)}</b>
            </div>
            <div className="ok-kart">
              <span>Dosyadaki net hareket</span>
              <b>{isaretli(sonuc.ozet.net)}</b>
            </div>
            <div className={`ok-kart ${sonuc.ozet.sorun ? 'sorun' : 'temiz'}`}>
              <span>Kontrol sonucu</span>
              <b>{sonuc.ozet.sorun ? `${sonuc.ozet.sorun} sorun` : 'Hepsi tutuyor'}</b>
              <small>
                {sonuc.ozet.kayitYok} kayıt yok · {sonuc.ozet.odealdaYok} Ödeal’da yok · {sonuc.ozet.gelenFark} gelen farkı
              </small>
            </div>
          </div>

          <div className="m2-card">
            <h2>Bakiye kontrolü</h2>
            <div className="ok-bakiye">
              <label>
                Ödeal uygulamasındaki güncel bakiye (₺)
                <input className="m2-input" inputMode="decimal" placeholder="İsteğe bağlı" value={bakiye} onChange={(e) => setBakiye(e.target.value)} />
              </label>
              <div>
                <span>Hippos’taki “Ödeal Kredi Kartı” bakiyesi</span>
                <b>{veri.hipposBakiye === null ? '—' : TL(veri.hipposBakiye)}</b>
              </div>
              <div className={bakiyeFark === null ? '' : bakiyeFark === 0 ? 'ok-iyi' : 'ok-kotu'}>
                <span>Fark (Ödeal − Hippos)</span>
                <b>{bakiyeFark === null ? 'Bakiye girin' : bakiyeFark === 0 ? 'Fark yok' : isaretli(bakiyeFark)}</b>
              </div>
            </div>
            <p className="ok-ipucu">Not: Bakiye farkı, aşağıdaki “kayıt yok / Ödeal’da yok” satırları ve provizyonlarla açıklanır.</p>
          </div>

          <div className="m2-card">
            <h2>Gelenler — Ödeal’a düşen ile günsonu POS kartı</h2>
            <p className="ok-ipucu">Ödeal komisyon kesmediği için, bir günün POS kart toplamı ertesi gün Ödeal’a aynen düşmelidir.</p>
            <div className="m2-table-wrap">
              <table className="m2-table">
                <thead>
                  <tr>
                    <th>Ödeal’a düştüğü gün</th>
                    <th className="sayi">Ödeal (parçalar)</th>
                    <th>Günsonu günü</th>
                    <th className="sayi">Hippos günsonu</th>
                    <th className="sayi">Fark</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {sonuc.gelenler.length === 0 && (
                    <tr>
                      <td colSpan={6} className="m2-empty">
                        Dosyada gelen satırı yok.
                      </td>
                    </tr>
                  )}
                  {sonuc.gelenler.map((g) => {
                    const d = GELEN_DURUM[g.durum];
                    return (
                      <tr key={g.tarih}>
                        <td className="nowrap">{tarihTR(g.tarih)}</td>
                        <td className="sayi">
                          {TL(g.odeal)}
                          {g.parcalar.length > 1 && <small className="ok-parca"> ({g.parcalar.map((p) => TL(p)).join(' + ')})</small>}
                        </td>
                        <td className="nowrap">{tarihTR(g.posTarihi)}</td>
                        <td className="sayi">{g.hippos ? TL(g.hippos) : '—'}</td>
                        <td className={`sayi ${g.fark ? 'm2-neg' : ''}`}>{g.fark ? isaretli(g.fark) : '—'}</td>
                        <td>
                          <span className={`ok-rozet ${d.sinif}`}>
                            {d.simge} {d.etiket}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="m2-card">
            <div className="ok-baslik-satir">
              <h2>Giderler</h2>
              <div className="ok-aksiyonlar">
                <div className="ok-segment">
                  <button className={gorunum === 'giderler' ? 'on' : ''} onClick={() => setGorunum('giderler')}>
                    Satır satır
                  </button>
                  <button className={gorunum === 'firma' ? 'on' : ''} onClick={() => setGorunum('firma')}>
                    Firma bazlı
                  </button>
                </div>
                {gorunum === 'giderler' && (
                  <label className="ok-onay">
                    <input type="checkbox" checked={yalnizSorun} onChange={(e) => setYalnizSorun(e.target.checked)} /> Yalnız sorunlular
                  </label>
                )}
                <button className="m2-btn mini" onClick={() => setPaylasAcik(true)}>
                  <Share2 size={14} style={{ verticalAlign: '-2px' }} /> PNG paylaş
                </button>
              </div>
            </div>

            {gorunum === 'giderler' ? (
              <div className="m2-table-wrap">
                <table className="m2-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Ödeal açıklaması</th>
                      <th>Firma</th>
                      <th className="sayi">Tutar</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {giderListe.length === 0 && (
                      <tr>
                        <td colSpan={5} className="m2-empty">
                          Gösterilecek satır yok.
                        </td>
                      </tr>
                    )}
                    {giderListe.map((g) => {
                      const d = DURUM[g.durum];
                      return (
                        <tr key={`${g.tip}-${g.id}`}>
                          <td className="nowrap">{tarihTR(g.tarih)}</td>
                          <td>
                            {g.tip === 'odeal' ? g.aciklama : <i>Muhasebede kayıtlı ödeme</i>}
                            {g.provizyon && <span className="ok-rozet bek"> ⏳ provizyon</span>}
                          </td>
                          <td>
                            {g.firmaAdi || <span className="ok-silik">Firma bulunamadı</span>}
                            {g.tip === 'odeal' && !g.firmaId && (
                              <button className="ok-link" onClick={() => setBaglaModal({ anahtar: g.anahtar, aciklama: g.aciklama })}>
                                <Link2 size={12} /> Firmaya bağla
                              </button>
                            )}
                            {g.tip === 'odeal' && g.oneri && (
                              <button className="ok-link" title="Bu açıklama bir daha otomatik bu firmaya bağlansın" onClick={() => esle(g.anahtar, g.aciklama, g.oneri.firmaId, g.oneri.firmaAdi)}>
                                <Link2 size={12} /> Hep “{g.oneri.firmaAdi}” say
                              </button>
                            )}
                          </td>
                          <td className="sayi">{TL(g.tutar)}</td>
                          <td>
                            <span className={`ok-rozet ${d.sinif}`}>
                              {d.simge} {d.etiket}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="m2-table-wrap">
                <table className="m2-table">
                  <thead>
                    <tr>
                      <th>Firma</th>
                      <th className="sayi">Ödeal’dan ödenen</th>
                      <th className="sayi">Bekleyen provizyon</th>
                      <th className="sayi">Muhasebede kayıtlı</th>
                      <th className="sayi">Fark</th>
                      <th>Farkın kaynağı</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sonuc.firmaGruplari.map((g) => {
                      const sorunlu = g.satirlar.filter((s) => s.durum !== 'eslesti');
                      return (
                        <tr key={g.firmaId || 'yok'} className={g.fark ? 'ok-satir-fark' : ''}>
                          <td>
                            <b>{g.firmaAdi}</b>
                          </td>
                          <td className="sayi">{TL(g.odeal)}</td>
                          <td className="sayi">{g.odealProvizyon ? TL(g.odealProvizyon) : '—'}</td>
                          <td className="sayi">{TL(g.kayit)}</td>
                          <td className={`sayi ${g.fark ? 'm2-neg' : ''}`}>{g.fark ? isaretli(g.fark) : '✅ Tutuyor'}</td>
                          <td className="ok-kaynak">
                            {sorunlu.length === 0
                              ? '—'
                              : sorunlu.map((s) => (
                                  <div key={`${s.tip}-${s.id}`}>
                                    {tarihTR(s.tarih)} · {TL(s.tutar)} · {s.tip === 'odeal' ? (s.provizyon ? 'provizyon, kayıt yok' : 'Ödeal’da var, kayıt yok') : 'kayıtlı, Ödeal’da yok'}
                                    {s.tip === 'odeal' && !g.firmaId && (
                                      <button className="ok-link" onClick={() => setBaglaModal({ anahtar: s.anahtar, aciklama: s.aciklama })}>
                                        <Link2 size={12} /> Firmaya bağla
                                      </button>
                                    )}
                                  </div>
                                ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="m2-card">
            <h2>Kayıtlı eşlemeler ({eslemeListe.length})</h2>
            <p className="ok-ipucu">“Firmaya bağla” ile kaydettiğiniz Ödeal açıklamaları. Yalnız bu araç kullanır; muhasebe kaydı değildir.</p>
            {eslemeListe.length === 0 ? (
              <div className="ok-silik">Henüz eşleme yok.</div>
            ) : (
              <div className="ok-eslemeler">
                {eslemeListe.map((e) => (
                  <div key={e.anahtar}>
                    <span>{e.ornek || e.anahtar}</span>
                    <b>→ {firmaAdiById.get(e.firmaId) || '(silinmiş firma)'}</b>
                    <button className="ok-link" onClick={() => eslemeSil(e.anahtar)}>
                      <Trash2 size={12} /> Sil
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {baglaModal && <FirmayaBagla modal={baglaModal} firmalar={veri?.firmalar || []} onKapat={() => setBaglaModal(null)} onSec={(f) => esle(baglaModal.anahtar, baglaModal.aciklama, f.id, f.ad)} />}
      {paylasAcik && sonuc && (
        <OdealPaylas sonuc={sonuc} dosya={dosya} bakiye={{ girilen: bakiyeGirilen, hippos: veri.hipposBakiye, fark: bakiyeFark }} onKapat={() => setPaylasAcik(false)} />
      )}
    </div>
  );
}

function FirmayaBagla({ modal, firmalar, onKapat, onSec }) {
  const [q, setQ] = useState('');
  const liste = useMemo(() => {
    const n = trNorm(q);
    return (n ? firmalar.filter((f) => trNorm(f.ad).includes(n)) : firmalar).slice(0, 30);
  }, [q, firmalar]);
  return (
    <ModalKabuk baslik="Ödeal satırını bir firmaya bağla" onKapat={onKapat}>
      <p className="ok-ipucu">
        <b>{modal.aciklama}</b>
        <br />
        Bu açıklama bir daha geldiğinde seçtiğiniz firmayla eşleşir. Muhasebe kaydı değişmez.
      </p>
      <input className="m2-input" autoFocus placeholder="Firma adı ara…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="ok-firma-liste">
        {liste.length === 0 && <div className="ok-silik">Eşleşen firma yok.</div>}
        {liste.map((f) => (
          <button key={f.id} className="m2-dd-item" onClick={() => onSec(f)}>
            {f.ad}
          </button>
        ))}
      </div>
    </ModalKabuk>
  );
}

// ---------------------------------------------------------------------------
// PNG paylaş: genişlik sabit 1080 px; içerik kadar uzar. Yalnız sorunlu satırlar gösterilir.
// ---------------------------------------------------------------------------
const MAKS = { gider: 14, gelen: 6, firma: 10 };

function OdealPaylas({ sonuc, dosya, bakiye, onKapat }) {
  const kartRef = useRef(null);
  const [png, setPng] = useState(null);
  const [hata, setHata] = useState('');
  const [kopyalandi, setKopyalandi] = useState(false);
  const dosyaAdi = `odeal-kontrol-${dosya.bas}_${dosya.bit}.png`;
  const paylasilabilir = typeof navigator !== 'undefined' && !!navigator.share && !!navigator.canShare;

  const sorunGider = sonuc.giderler.filter((g) => g.durum !== 'eslesti');
  const sorunGelen = sonuc.gelenler.filter((g) => g.durum !== 'tamam' && g.durum !== 'bekleniyor');
  const farkliFirma = sonuc.firmaGruplari.filter((g) => g.fark);

  useEffect(() => {
    let iptal = false;
    let url = null;
    (async () => {
      try {
        if (document.fonts) {
          await Promise.all([document.fonts.load("40px 'Archivo Black'"), document.fonts.load("700 30px 'Space Grotesk'")]).catch(() => {});
          await document.fonts.ready;
        }
        const el = kartRef.current;
        const canvas = await html2canvas(el, { scale: 1, backgroundColor: null, useCORS: true, logging: false, width: 1080, height: el.scrollHeight, windowWidth: 1080 });
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
        if (!blob) throw new Error('bos');
        url = URL.createObjectURL(blob);
        if (!iptal) setPng({ blob, url });
      } catch {
        if (!iptal) setHata('Görsel oluşturulamadı. Sayfayı yenileyip tekrar deneyin.');
      }
    })();
    return () => {
      iptal = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, []);

  async function kopyala() {
    if (!png) return;
    try {
      if (!navigator.clipboard || !window.ClipboardItem) throw new Error('yok');
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': png.blob })]);
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2000);
    } catch {
      setHata('Bu tarayıcı görseli panoya kopyalayamıyor. İndir ile kaydedip gönderebilirsiniz.');
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
    const f = new File([png.blob], dosyaAdi, { type: 'image/png' });
    if (!navigator.canShare({ files: [f] })) {
      setHata('Bu cihaz dosya paylaşımını desteklemiyor. İndir ile kaydedin.');
      return;
    }
    try {
      await navigator.share({ files: [f] });
    } catch {
      /* vazgeçildi */
    }
  }

  const daha = (n, maks) => (n > maks ? <div className="okp-daha">+ {n - maks} satır daha (ekranda görünür)</div> : null);

  return (
    <div className="m2-modal-bg" onClick={onKapat}>
      <div className="m2-modal genis ok-paylas-pen" onClick={(e) => e.stopPropagation()}>
        <div className="m2-modal-head">
          <h3>Ödeal kontrol görseli</h3>
          <button onClick={onKapat} aria-label="Kapat">
            ✕
          </button>
        </div>
        <div className="ok-onizleme">{png ? <img src={png.url} alt="Ödeal kontrol görseli" /> : !hata && <div className="ok-silik">Görsel hazırlanıyor…</div>}</div>
        {hata && <div className="m2-err">{hata}</div>}
        <div className="ok-aksiyonlar">
          <button className="m2-btn" onClick={kopyala} disabled={!png}>
            {kopyalandi ? <Check size={14} /> : <Copy size={14} />} {kopyalandi ? 'Kopyalandı' : 'PNG Kopyala'}
          </button>
          <button className="m2-btn sec" onClick={indir} disabled={!png}>
            <Download size={14} /> İndir
          </button>
          {paylasilabilir && (
            <button className="m2-btn sec" onClick={paylas} disabled={!png}>
              <Share2 size={14} /> Paylaş
            </button>
          )}
        </div>

        <div className="okp-sahne" aria-hidden="true">
          <div ref={kartRef} className="okp">
            <div className="okp-bant">
              <span>PERPA SANDVİÇ</span>
              <small>ÖDEAL KONTROL</small>
            </div>
            <div className="okp-ic">
              <div className="okp-tarih">
                {tarihTR(dosya.bas)} – {tarihTR(dosya.bit)}
              </div>
              <div className="okp-kutular">
                <div>
                  <span>GELEN</span>
                  <b>{TL(sonuc.ozet.gelen)}</b>
                </div>
                <div>
                  <span>GİDEN</span>
                  <b>{TL(sonuc.ozet.gidenBasarili)}</b>
                </div>
                <div>
                  <span>PROVİZYON</span>
                  <b>{TL(sonuc.ozet.gidenProvizyon)}</b>
                </div>
                <div>
                  <span>NET</span>
                  <b>{isaretli(sonuc.ozet.net)}</b>
                </div>
              </div>

              {sonuc.ozet.sorun === 0 && <div className="okp-temiz">✅ Her şey tutuyor</div>}

              {sorunGelen.length > 0 && (
                <section className="okp-bolum">
                  <h4>GELEN FARKLARI</h4>
                  {sorunGelen.slice(0, MAKS.gelen).map((g) => (
                    <div key={g.tarih} className="okp-satir">
                      <span>
                        {tarihTR(g.tarih)} · {GELEN_DURUM[g.durum].etiket}
                      </span>
                      <b>
                        Ödeal {TL(g.odeal)} / Hippos {TL(g.hippos)}
                      </b>
                    </div>
                  ))}
                  {daha(sorunGelen.length, MAKS.gelen)}
                </section>
              )}

              {sorunGider.length > 0 && (
                <section className="okp-bolum">
                  <h4>GİDER SORUNLARI</h4>
                  {sorunGider.slice(0, MAKS.gider).map((g) => (
                    <div key={`${g.tip}-${g.id}`} className="okp-satir">
                      <span>
                        {DURUM[g.durum].simge} {tarihTR(g.tarih)} · {g.firmaAdi || (g.aciklama || '').slice(0, 28)}
                        {g.provizyon ? ' (provizyon)' : ''} — {DURUM[g.durum].etiket}
                      </span>
                      <b>{TL(g.tutar)}</b>
                    </div>
                  ))}
                  {daha(sorunGider.length, MAKS.gider)}
                </section>
              )}

              {farkliFirma.length > 0 && (
                <section className="okp-bolum">
                  <h4>FİRMA FARKLARI</h4>
                  {farkliFirma.slice(0, MAKS.firma).map((g) => (
                    <div key={g.firmaId || 'yok'} className="okp-satir">
                      <span>{g.firmaAdi}</span>
                      <b>{isaretli(g.fark)}</b>
                    </div>
                  ))}
                  {daha(farkliFirma.length, MAKS.firma)}
                </section>
              )}

              {bakiye.girilen !== null && (
                <section className="okp-bolum">
                  <h4>BAKİYE</h4>
                  <div className="okp-satir">
                    <span>Ödeal uygulaması</span>
                    <b>{TL(bakiye.girilen)}</b>
                  </div>
                  <div className="okp-satir">
                    <span>Hippos</span>
                    <b>{bakiye.hippos === null ? '—' : TL(bakiye.hippos)}</b>
                  </div>
                  <div className="okp-satir">
                    <span>Fark</span>
                    <b>{bakiye.fark === null ? '—' : bakiye.fark === 0 ? 'Fark yok' : isaretli(bakiye.fark)}</b>
                  </div>
                </section>
              )}

              <div className="okp-alt">
                {sonuc.ozet.eslesen} satır eşleşti · {sonuc.ozet.kayitYok} kayıt yok · {sonuc.ozet.odealdaYok} Ödeal’da yok
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

