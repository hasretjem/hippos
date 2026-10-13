import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FileUp, Filter, Pencil, Plus, Share2 } from 'lucide-react';
import { dosyaAdi, durumBul, ekstreGorunum, ekstrePdfTanimi, ekstrePdfUret, paraFmt, pdfPaylasVeyaIndir } from './ekstrePdf';
import { ModalAksiyon, ModalKabuk, TL, api, bugunISO, sayi, sayiFmt, tarihTR, trNorm, useModalKaydet, CekmeceKutusu, firmaAdiOner } from './m2Ortak';
import YemekKartlariSekmesi from './YemekKartlari';
import TahakkuklarSekmesi from './Tahakkuklar';
import GunsonlariSekmesi from './Gunsonlari';
import XmlCekmece from './XmlCekmece';
import { rcApi } from '../Receteler/rcOrtak';
import { FILTRE_KOLONLARI, FiltreMenu, bosSecimler, filtreUygula, varsayilanTarihSecimi } from './DatalarFiltre';
import './Muhasebe2.css';
import useIsMobile from '../../hooks/useIsMobile';

// ---------------------------------------------------------------------------
// Muhasebe2 — Sekmeler: "Fişler/Faturalar ve Makbuzlar" (giriş), "Datalar" (Excel düzeninde döküm,
// Excel tarzı filtreler, Düzenleme Modu), "Hesap Özetleri" (cari kartları, düzenleme, ekstre ve PDF),
// "Yemek Kartları" ve "Tahakkuklar" (personel maaşı + sabit giderler).
// Giriş: sol Fiş/Fatura formu, sağ Tahsilat / Ödeme makbuzu (kaydırmalı anahtar).
// Cari dışı yöntemle girilen her fatura için ödeme şekli carisine otomatik makbuz yazılır (sunucu yapar).
// ---------------------------------------------------------------------------

const FATURA_ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi', 'Ortaklar', 'Cari'];
const MAKBUZ_ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi', 'Ortaklar'];
const MAKS_GECMIS = 3;
const KAYNAK_ETIKET = { yemek_karti: 'Yemek Kartları', tahakkuk: 'Tahakkuklar', avans: 'Personel Klasörü', izin: 'Personel Klasörü', devir: 'Devir', hizli_gider: 'Harcama', gunsonu: 'Günsonları' };

// XML faturadaki tedarikçi adını Muhasebe2 firmalarıyla eşler (tam eşleşme, sonra kelime benzerliği).
const FIRMA_DURAK = new Set(['ltd', 'sti', 'şti', 'as', 'aş', 'a.ş', 'a.ş.', 'san', 'tic', 've', 'limited', 'anonim', 'sirketi', 'şirketi', 'ticaret', 'sanayi', 'gida', 'gıda', 'paz', 'pazarlama', 'ith', 'ihr']);
function firmaKelimeleri(ad) {
  return new Set(
    trNorm(ad)
      .replace(/[.,;:()\-/&]/g, ' ')
      .split(/\s+/)
      .filter((k) => k.length > 1 && !FIRMA_DURAK.has(k)),
  );
}
// Önce fatura sözlüğü (VKN/TCKN tam eşleşme = kesin), sonra isim benzerliği (tahmin).
function firmaBulKimlikle(firmalar, kimlikler, vkn) {
  const v = String(vkn || '').replace(/\D/g, '');
  if (!v) return null;
  const k = (kimlikler || []).find((x) => x.vkn === v);
  return k ? firmalar.find((f) => f.id === k.firmaId) || null : null;
}
function firmaBul(firmalar, tedarikciAdi) {
  const hedef = firmaKelimeleri(tedarikciAdi);
  if (!hedef.size) return null;
  let en = null;
  let enPuan = 0;
  firmalar
    .filter((f) => !f.firma_turu || f.firma_turu === 'Firma')
    .forEach((f) => {
      const k = firmaKelimeleri(f.ad);
      if (!k.size) return;
      let ortak = 0;
      k.forEach((x) => hedef.has(x) && (ortak += 1));
      const puan = ortak / (k.size + hedef.size - ortak);
      if (puan > enPuan) {
        enPuan = puan;
        en = f;
      }
    });
  return enPuan >= 0.6 ? en : null;
}

// Bakiye: pozitif = bizim borcumuz, negatif = firma bize borçlu.
function bakiyeEtiketi(b) {
  const v = Math.round((Number(b) || 0) * 100) / 100;
  if (v === 0) return { metin: 'Bakiye yok', ton: '' };
  return v > 0 ? { metin: `Borcumuz ${TL(v)}`, ton: 'r' } : { metin: `Bize borçlu ${TL(-v)}`, ton: 'g' };
}

// ---------------------------------------------------------------------------
// Ana bileşen
// ---------------------------------------------------------------------------
export default function Muhasebe2({ onNavigate }) {
  const [veri, setVeri] = useState({ firmalar: [], kategoriler: [], odemeYontemleri: [], firmaKimlikleri: [], bugun: '' });
  const [hata, setHata] = useState('');
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // {tur, ad, odemeTuru, bitince}
  const [sekme, setSekme] = useState('giris'); // 'giris' | 'datalar'
  const [xmlAcik, setXmlAcik] = useState(false); // yüklenen XML faturalar çekmecesi (varsayılan kapalı)
  const [xmlBekleyen, setXmlBekleyen] = useState(0);
  const [doldur, setDoldur] = useState(null); // { key, fatura } — çekmeceden "Aktar" ile forma gönderilir
  const zamanlayici = useRef(null);

  const bildir = useCallback((mesaj, hataMi = false) => {
    setToast({ mesaj, hata: hataMi });
    clearTimeout(zamanlayici.current);
    zamanlayici.current = setTimeout(() => setToast(null), hataMi ? 5000 : 3000);
  }, []);

  const yukle = useCallback(async () => {
    try {
      setVeri(await api('baslangic'));
      setHata('');
    } catch (e) {
      setHata(e.message);
    }
  }, []);
  useEffect(() => {
    yukle();
  }, [yukle]);
  useEffect(() => {
    rcApi('xmlSayi').then((j) => setXmlBekleyen(j.bekleyen || 0)).catch(() => {});
  }, []);

  // ---- Düzenleme Modu ve geri/ileri alma (Ctrl+Z / Ctrl+Shift+Z, son 3 işlem; yalnızca bu oturumda) ----
  const [duzenlemeModu, setDuzenlemeModu] = useState(false);
  const [gecmis, setGecmis] = useState({ liste: [], index: -1 });
  const [yenileSayac, setYenileSayac] = useState(0);
  const gecmisRef = useRef(gecmis);
  gecmisRef.current = gecmis;
  const islemKilidi = useRef(false);

  // Her işlem sunucudan {grupId, oncesi, sonrasi} anlık görüntüsüyle döner; geri alma bunları kullanır.
  const gecmiseEkle = useCallback((sonuc, etiket) => {
    let kayit;
    if (sonuc.geri) kayit = { tur: 'datalar', geri: sonuc.geri, ileri: sonuc.ileri, etiket };
    else if (sonuc.gunsonu) kayit = { tur: 'gunsonu', oncesi: sonuc.gunsonu.oncesi, sonrasi: sonuc.gunsonu.sonrasi, etiket };
    else if (sonuc.hizliSil) kayit = { tur: 'hizliSil', grupId: sonuc.hizliSil.grupId, oncesi: sonuc.hizliSil.oncesi, etiket };
    else if (!sonuc.sonrasi) return; // geri alınamayan işlem
    else kayit = { grupId: sonuc.grupId, oncesi: sonuc.oncesi, sonrasi: sonuc.sonrasi, etiket };
    setGecmis((g) => {
      const liste = [...g.liste.slice(0, g.index + 1), kayit].slice(-MAKS_GECMIS);
      return { liste, index: liste.length - 1 };
    });
  }, []);

  const geriIleri = useCallback(
    async (yon) => {
      if (islemKilidi.current) return;
      const { liste, index } = gecmisRef.current;
      const hedef = yon === 'geri' ? liste[index] : liste[index + 1];
      if (!hedef) return;
      islemKilidi.current = true;
      try {
        if (hedef.tur === 'datalar') {
          await api('datalarDurumYaz', { method: 'POST', body: { durum: yon === 'geri' ? hedef.geri : hedef.ileri } });
        } else if (hedef.tur === 'gunsonu') {
          await api('gunsonuGeriYaz', {
            method: 'POST',
            body: { beklenen: yon === 'geri' ? hedef.sonrasi : hedef.oncesi, yazilacak: yon === 'geri' ? hedef.oncesi : hedef.sonrasi },
          });
        } else if (hedef.tur === 'hizliSil') {
          if (yon === 'geri') await api('hizliGiderGeriYaz', { method: 'POST', body: hedef.oncesi });
          else await api('hizliGiderSil', { method: 'POST', body: { id: hedef.grupId } });
        } else {
          await api('kayitGeriYaz', {
            method: 'POST',
            body: {
              grupId: hedef.grupId,
              beklenen: yon === 'geri' ? hedef.sonrasi : hedef.oncesi,
              yazilacak: yon === 'geri' ? hedef.oncesi : hedef.sonrasi,
            },
          });
        }
        setGecmis((g) => ({ ...g, index: g.index + (yon === 'geri' ? -1 : 1) }));
        bildir(`${yon === 'geri' ? 'Geri alındı' : 'İleri alındı'}: ${hedef.etiket}`);
        setYenileSayac((n) => n + 1);
        await yukle();
      } catch (e) {
        bildir(e.message, true);
      } finally {
        islemKilidi.current = false;
      }
    },
    [bildir, yukle],
  );

  // Günsonları sekmesinin KENDİ geçmişi var (son 3 işlem); geri/ileri düğmeleri ve Ctrl+Z hangi sekmedeysen onu geri alır.
  const [gsGecmis, setGsGecmis] = useState({ liste: [], index: -1 });
  const [gsYenile, setGsYenile] = useState(0);
  const gsGecmisRef = useRef(gsGecmis);
  gsGecmisRef.current = gsGecmis;
  const sekmeRef = useRef(sekme);
  sekmeRef.current = sekme;

  const gsGecmiseEkle = useCallback((sonuc, etiket) => {
    setGsGecmis((g) => {
      const liste = [...g.liste.slice(0, g.index + 1), { oncesi: sonuc.oncesi, sonrasi: sonuc.sonrasi, etiket }].slice(-MAKS_GECMIS);
      return { liste, index: liste.length - 1 };
    });
  }, []);

  const gsGeriIleri = useCallback(
    async (yon) => {
      if (islemKilidi.current) return;
      const { liste, index } = gsGecmisRef.current;
      const hedef = yon === 'geri' ? liste[index] : liste[index + 1];
      if (!hedef) return;
      islemKilidi.current = true;
      try {
        await api('gunsonuGeriYaz', {
          method: 'POST',
          body: { beklenen: yon === 'geri' ? hedef.sonrasi : hedef.oncesi, yazilacak: yon === 'geri' ? hedef.oncesi : hedef.sonrasi },
        });
        setGsGecmis((g) => ({ ...g, index: g.index + (yon === 'geri' ? -1 : 1) }));
        bildir(`${yon === 'geri' ? 'Geri alındı' : 'İleri alındı'}: ${hedef.etiket}`);
        setGsYenile((n) => n + 1);
      } catch (e) {
        bildir(e.message, true);
      } finally {
        islemKilidi.current = false;
      }
    },
    [bildir],
  );

  const aktifGeriIleri = useCallback((yon) => (sekmeRef.current === 'gunsonlari' ? gsGeriIleri(yon) : geriIleri(yon)), [gsGeriIleri, geriIleri]);
  const aktifGecmis = sekme === 'gunsonlari' ? gsGecmis : gecmis;

  useEffect(() => {
    if (!duzenlemeModu) return undefined;
    function tusa(e) {
      const hedef = e.target;
      const etiket = String(hedef?.tagName || '').toLowerCase();
      // Yazı alanındayken Ctrl+Z tarayıcının kendi metin geri almasına bırakılır.
      if (['input', 'textarea', 'select'].includes(etiket) || hedef?.isContentEditable) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = String(e.key).toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        aktifGeriIleri(e.shiftKey ? 'ileri' : 'geri');
      } else if (k === 'y') {
        e.preventDefault();
        aktifGeriIleri('ileri');
      }
    }
    window.addEventListener('keydown', tusa);
    return () => window.removeEventListener('keydown', tusa);
  }, [duzenlemeModu, aktifGeriIleri]);

  async function fisFaturaKaydet(payload) {
    await api('fisFaturaKaydet', { method: 'POST', body: payload });
    const evrak = payload.iade ? 'İade faturası' : 'Fatura';
    bildir(
      payload.odemeTuru === 'Cari'
        ? `${evrak} kaydedildi (cariye yazıldı)`
        : payload.iade
          ? 'İade faturası kaydedildi, tahsilat ve ödeme makbuzları otomatik oluşturuldu'
          : 'Fatura kaydedildi, ödeme ve tahsilat makbuzları otomatik oluşturuldu',
    );
    await yukle();
  }
  async function makbuzKaydet(payload) {
    await api('makbuzKaydet', { method: 'POST', body: payload });
    bildir(`${payload.makbuzTuru} makbuzu kaydedildi, ${payload.odemeHesabi || payload.kasa} carisine karşı makbuz yazıldı`);
    await yukle();
  }

  // Tanım ekleme (modallardan çağrılır) — hata fırlatırsa modal içinde gösterilir.
  async function firmaEkle(payload) {
    const j = await api('firmaEkle', { method: 'POST', body: payload });
    if (j.kimlikUyari) bildir(j.kimlikUyari, true);
    await yukle();
    return j.firma;
  }
  async function kimlikKaydet(payload) {
    await api('firmaKimlikKaydet', { method: 'POST', body: payload });
    await yukle();
  }
  async function kategoriEkle(payload) {
    const j = await api('kategoriEkle', { method: 'POST', body: payload });
    await yukle();
    return j.kategori;
  }
  async function yontemEkle(payload) {
    const j = await api('yontemEkle', { method: 'POST', body: payload });
    await yukle();
    return j.yontem;
  }

  function bitir(sonuc) {
    modal?.bitince?.(sonuc);
    setModal(null);
  }

  return (
    <div className="m2-shell">
      <div className="m2-ust">
        <button className="m2-back" onClick={() => (onNavigate ? onNavigate('settings') : (window.location.href = '/'))}>
          <ArrowLeft size={16} /> Geri
        </button>
        <div className="m2-ust-aksiyon">
          {duzenlemeModu && (
            <>
              <button className="m2-btn sec mini" disabled={aktifGecmis.index < 0} onClick={() => aktifGeriIleri('geri')} title="Ctrl+Z">
                ↶ Geri Al
              </button>
              <button className="m2-btn sec mini" disabled={aktifGecmis.index >= aktifGecmis.liste.length - 1} onClick={() => aktifGeriIleri('ileri')} title="Ctrl+Shift+Z">
                ↷ İleri Al
              </button>
            </>
          )}
          <button
            type="button"
            className={`m2-mod-toggle ${duzenlemeModu ? 'edit' : ''}`}
            aria-pressed={duzenlemeModu}
            onClick={() => setDuzenlemeModu((v) => !v)}
            title="Datalar ve Günsonları sekmelerinde düzenleme ve silmeye izin verir"
          >
            <span className="thumb" />
            <span className="etiket e1">Basit Mod</span>
            <span className="etiket e2">Düzenleme Modu</span>
          </button>
        </div>
      </div>
      <h1 className="m2-title">
        Muhasebe2 <small>test</small>
      </h1>

      {hata && <div className="m2-err">{hata}</div>}

      <div className="m2-tabs">
        <button className={`m2-tab ${sekme === 'giris' ? 'on' : ''}`} onClick={() => setSekme('giris')}>
          Fişler/Faturalar ve Makbuzlar
        </button>
        <button className={`m2-tab ${sekme === 'datalar' ? 'on' : ''}`} onClick={() => setSekme('datalar')}>
          Datalar
        </button>
        <button className={`m2-tab ${sekme === 'ozetler' ? 'on' : ''}`} onClick={() => setSekme('ozetler')}>
          Hesap Özetleri
        </button>
        <button className={`m2-tab ${sekme === 'yemek' ? 'on' : ''}`} onClick={() => setSekme('yemek')}>
          Yemek Kartları
        </button>
        <button className={`m2-tab ${sekme === 'tahakkuk' ? 'on' : ''}`} onClick={() => setSekme('tahakkuk')}>
          Tahakkuklar
        </button>
        <button className={`m2-tab ${sekme === 'gunsonlari' ? 'on' : ''}`} onClick={() => setSekme('gunsonlari')}>
          Günsonları
        </button>
      </div>

      {/* Formlar sekme değişince silinmesin diye gizlenir, kaldırılmaz. */}
      <div className="m2-grid" style={{ display: sekme === 'giris' ? undefined : 'none' }}>
        <div className="m2-card">
          <FisFaturaFormu
            veri={veri}
            bildir={bildir}
            onKaydet={fisFaturaKaydet}
            onModal={setModal}
            doldur={doldur}
            onKimlikKaydet={kimlikKaydet}
            xmlBekleyen={xmlBekleyen}
            onXmlAc={() => setXmlAcik((a) => !a)}
            onXmlKullanildi={async (id) => {
              try {
                await rcApi('xmlDurum', { method: 'POST', body: { id, durum: 'kullanildi' } });
                setXmlBekleyen((n) => Math.max(0, n - 1));
              } catch {
                /* fatura kaydedildi; yalnızca çekmece işareti güncellenemedi */
              }
            }}
          />
        </div>
        <div className="m2-card m2-xc-sarmal">
          <MakbuzFormu veri={veri} bildir={bildir} onKaydet={makbuzKaydet} onModal={setModal} />
          {xmlAcik && (
            <XmlCekmece
              bildir={bildir}
              firmalar={veri.firmalar}
              kimlikler={veri.firmaKimlikleri}
              onKimlikKaydet={kimlikKaydet}
              onFirmaEkle={firmaEkle}
              firmaOner={(ad) => firmaBul(veri.firmalar, ad)}
              onKapat={() => setXmlAcik(false)}
              onSayi={setXmlBekleyen}
              onAktar={(fatura) => {
                setDoldur({ key: Date.now(), fatura });
                setXmlAcik(false);
              }}
            />
          )}
        </div>
      </div>
      <div style={{ display: sekme === 'datalar' ? undefined : 'none' }}>
        <DatalarSekmesi
          aktif={sekme === 'datalar'}
          duzenlemeModu={duzenlemeModu}
          veri={veri}
          bildir={bildir}
          yenile={yenileSayac}
          onIslem={gecmiseEkle}
          onDegisti={yukle}
        />
      </div>
      <div style={{ display: sekme === 'ozetler' ? undefined : 'none' }}>
        <HesapOzetleriSekmesi aktif={sekme === 'ozetler'} bildir={bildir} onDegisti={yukle} />
      </div>
      <div style={{ display: sekme === 'yemek' ? undefined : 'none' }}>
        <YemekKartlariSekmesi aktif={sekme === 'yemek'} bildir={bildir} yontemler={veri.odemeYontemleri} onDegisti={yukle} />
      </div>
      <div style={{ display: sekme === 'tahakkuk' ? undefined : 'none' }}>
        <TahakkuklarSekmesi aktif={sekme === 'tahakkuk'} bildir={bildir} kategoriler={veri.kategoriler} onDegisti={yukle} />
      </div>
      <div style={{ display: sekme === 'gunsonlari' ? undefined : 'none' }}>
        <GunsonlariSekmesi aktif={sekme === 'gunsonlari'} duzenlemeModu={duzenlemeModu} bildir={bildir} yenile={gsYenile} onIslem={gsGecmiseEkle} />
      </div>

      {modal?.tur === 'firma' && (
        <FirmaModal
          baslangicAd={modal.ad}
          baslangicVkn={modal.vkn}
          baslangicUnvan={modal.unvan}
          kategoriler={veri.kategoriler}
          onKaydet={firmaEkle}
          onBitti={bitir}
          onKapat={() => setModal(null)}
        />
      )}
      {modal?.tur === 'kategori' && (
        <KategoriModal onKaydet={kategoriEkle} onBitti={bitir} onKapat={() => setModal(null)} />
      )}
      {modal?.tur === 'yontem' && (
        <YontemModal
          varsayilanTur={modal.odemeTuru}
          onKaydet={yontemEkle}
          onBitti={bitir}
          onKapat={() => setModal(null)}
        />
      )}

      {toast && <div className={`m2-toast ${toast.hata ? 'hata' : ''}`}>{toast.mesaj}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Firma seçici: yazdıkça arar, bakiyeyi gösterir.
// ---------------------------------------------------------------------------
function FirmaSecici({ firmalar, valueId, onChange, onYeni }) {
  const secili = firmalar.find((f) => f.id === valueId) || null;
  const [metin, setMetin] = useState('');
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    if (secili) setMetin(secili.ad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueId]);

  const sonuc = useMemo(() => {
    const q = trNorm(metin);
    const liste = q && !secili ? firmalar.filter((f) => trNorm(f.ad).includes(q)) : firmalar;
    return liste.slice(0, 8);
  }, [metin, firmalar, secili]);

  return (
    <div className="m2-dd-wrap">
      <div className="m2-row">
        <div className="m2-grow">
          <input
            className="m2-input"
            placeholder="Firma adı ara…"
            value={metin}
            onChange={(e) => {
              setMetin(e.target.value);
              if (valueId) onChange('');
              setAcik(true);
            }}
            onFocus={() => setAcik(true)}
            onBlur={() => setAcik(false)}
          />
        </div>
        <button type="button" className="m2-btn sec mini" onClick={() => onYeni(secili ? '' : metin)}>
          <Plus size={14} style={{ verticalAlign: '-2px' }} /> Yeni
        </button>
      </div>
      {acik && (
        <div className="m2-dd">
          {sonuc.length === 0 ? (
            <div className="m2-dd-empty">Eşleşen firma yok. “Yeni” ile ekleyebilirsiniz.</div>
          ) : (
            sonuc.map((f) => (
              <button
                type="button"
                key={f.id}
                className="m2-dd-item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(f.id);
                  setAcik(false);
                }}
              >
                <span>{f.ad}</span>
                <small>
                  {f.firma_turu === 'Ödeme Şekli' ? 'Ödeme şekli • ' : ''}
                  {bakiyeEtiketi(f.bakiye).metin}
                </small>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ödeme türü seçimi (iki formda ortak): tür -> kasa / kart / banka.
// ---------------------------------------------------------------------------
function OdemeSecimi({ turler, tur, detay, onChange, yontemler, onYeni, cariNotu }) {
  const kasalar = yontemler.filter((y) => y.odeme_turu === 'Nakit');
  const kartlar = yontemler.filter((y) => y.odeme_turu === 'Kredi Kartı');
  const bankalar = yontemler.filter((y) => y.odeme_turu === 'Banka Havalesi');
  const ortaklar = yontemler.filter((y) => y.odeme_turu === 'Ortaklar');

  const altChip = (ad) => (
    <button
      type="button"
      key={ad}
      className={`m2-chip ${detay === ad ? 'on' : ''}`}
      onClick={() => onChange(tur, ad)}
    >
      {ad}
    </button>
  );

  return (
    <div>
      <div className="m2-chips">
        {turler.map((t) => (
          <button
            type="button"
            key={t}
            className={`m2-chip ${tur === t ? 'on' : ''}`}
            onClick={() => onChange(t, t === 'Nakit' && kasalar.length === 1 ? kasalar[0].ad : '')}
          >
            {t}
          </button>
        ))}
        <button type="button" className="m2-chip yeni" onClick={() => onYeni('')}>
          + Yeni Yöntem
        </button>
      </div>

      {tur === 'Nakit' && (
        <div className="m2-chips alt">
          {kasalar.map((k) => altChip(k.ad))}
          <button type="button" className="m2-chip yeni" onClick={() => onYeni('Nakit')}>
            + Yeni Kasa
          </button>
        </div>
      )}
      {tur === 'Kredi Kartı' && (
        <div className="m2-chips alt">
          {kartlar.map((k) => altChip(k.ad))}
          <button type="button" className="m2-chip yeni" onClick={() => onYeni('Kredi Kartı')}>
            + Yeni Kart
          </button>
        </div>
      )}
      {tur === 'Banka Havalesi' && (
        <div className="m2-chips alt">
          {bankalar.map((b) => altChip(b.ad))}
          <button type="button" className="m2-chip yeni" onClick={() => onYeni('Banka Havalesi')}>
            + Yeni Banka
          </button>
        </div>
      )}
      {tur === 'Ortaklar' && (
        <div className="m2-chips alt">
          {ortaklar.map((o) => altChip(o.ad))}
          <button type="button" className="m2-chip yeni" onClick={() => onYeni('Ortaklar')}>
            + Yeni Ortak
          </button>
        </div>
      )}
      {tur === 'Cari' && cariNotu && <p className="m2-hint">{cariNotu}</p>}
    </div>
  );
}

// Ödeme seçiminden API alanlarını üretir; eksik seçim varsa hata mesajı döndürür.
function yontemPayload(tur, detay) {
  if (!tur) return { hata: 'Ödeme türünü seçin' };
  if (tur === 'Nakit') return detay ? { odemeTuru: tur, kasa: detay, odemeHesabi: '' } : { hata: 'Kasayı seçin' };
  if (tur === 'Kredi Kartı') return detay ? { odemeTuru: tur, odemeHesabi: detay, kasa: '' } : { hata: 'Kartı seçin' };
  if (tur === 'Banka Havalesi') return detay ? { odemeTuru: tur, odemeHesabi: detay, kasa: '' } : { hata: 'Bankayı seçin' };
  if (tur === 'Ortaklar') return detay ? { odemeTuru: tur, odemeHesabi: detay, kasa: '' } : { hata: 'Ortağı seçin' };
  return { odemeTuru: tur, odemeHesabi: '', kasa: '' }; // Cari
}

// ---------------------------------------------------------------------------
// Fiş / Fatura girişi
// ---------------------------------------------------------------------------
function FisFaturaFormu({ veri, bildir, onKaydet, onModal, doldur, onKimlikKaydet, xmlBekleyen, onXmlAc, onXmlKullanildi }) {
  const [iade, setIade] = useState(false); // false: Fatura/Fiş, true: İade Faturası (tutar artı girilir, sistem eksi işler)
  const [cekmece, setCekmece] = useState(false); // nakit ödeme çekmeceden verildi (günlük kasa)
  const [tarih, setTarih] = useState(veri.bugun || bugunISO());
  const [firmaId, setFirmaId] = useState('');
  const [faturaNo, setFaturaNo] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [kategori, setKategori] = useState('');
  const [tutar, setTutar] = useState('');
  const [kdv, setKdv] = useState('');
  const [tur, setTur] = useState('');
  const [detay, setDetay] = useState('');
  const [kaydediyor, setKaydediyor] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [vknBagla, setVknBagla] = useState(null); // { vkn, unvan, isaret } — XML'deki VKN sözlüğe bağlanacak mı
  const [aktarilan, setAktarilan] = useState(null); // çekmeceden forma aktarılan XML fatura (kaydedilince "kullanıldı" olur)

  // Çekmeceden "Aktar": formu doldurur, KAYDETMEZ — kontrol edip kaydetmek size kalır.
  useEffect(() => {
    if (!doldur) return;
    const f = doldur.fatura;
    const kimlikFirma = firmaBulKimlikle(veri.firmalar, veri.firmaKimlikleri, f.tedarikciVkn);
    const fm = kimlikFirma || firmaBul(veri.firmalar, f.tedarikciAdi);
    const vkn = String(f.tedarikciVkn || '').replace(/\D/g, '');
    setVknBagla(vkn && !kimlikFirma ? { vkn, unvan: f.tedarikciAdi, isaret: true } : null);
    setAktarilan(f);
    setIade(false);
    setCekmece(false);
    setTarih(f.tarih || veri.bugun || bugunISO());
    setFaturaNo(f.faturaNo || '');
    setAciklama('');
    setTutar(f.toplam != null ? String(f.toplam) : f.odenecek != null ? String(f.odenecek) : '');
    setKdv(f.kdvTutari ? String(f.kdvTutari) : '');
    setTur('');
    setDetay('');
    setFormKey((k) => k + 1);
    setFirmaId(fm ? fm.id : '');
    setKategori(fm && fm.varsayilan_kategori && veri.kategoriler.includes(fm.varsayilan_kategori) ? fm.varsayilan_kategori : '');

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doldur && doldur.key]);

  const firma = veri.firmalar.find((f) => f.id === firmaId) || null;
  const t = sayi(tutar);

  // firmaNesnesi: Yeni Firma penceresinden gelen firma henüz listede olmayabilir, doğrudan verilir.
  function firmaSec(id, firmaNesnesi) {
    setFirmaId(id);
    const f = firmaNesnesi || veri.firmalar.find((x) => x.id === id);
    if (f && f.varsayilan_kategori && !kategori && veri.kategoriler.includes(f.varsayilan_kategori)) {
      setKategori(f.varsayilan_kategori);
    }
  }

  async function kaydet() {
    if (!tarih) return bildir('Tarih seçin', true);
    if (!firmaId) return bildir('Firma seçin', true);
    if (!(t > 0)) return bildir('Tutarı girin', true);
    if (!kategori) return bildir('Gider kategorisini seçin', true);
    if (String(kdv).trim() !== '' && (sayi(kdv) < 0 || sayi(kdv) > t)) {
      return bildir('KDV tutarı 0 ile fatura tutarı arasında olmalı', true);
    }
    const y = yontemPayload(tur, detay);
    if (y.hata) return bildir(y.hata, true);
    setKaydediyor(true);
    try {
      await onKaydet({ tarih, firmaId, faturaNo, aciklama, giderKategorisi: kategori, faturaTutari: tutar, kdv, iade, ...(cekmece && tur === 'Nakit' && !iade && tarih === veri.bugun ? { kasaGrubu: 'gunluk' } : {}), ...y });
      if (vknBagla && vknBagla.isaret) {
        try {
          await onKimlikKaydet({ vkn: vknBagla.vkn, unvan: vknBagla.unvan, firmaId });
        } catch {
          /* fiş/fatura kaydedildi; yalnızca sözlük yazılamadı */
        }
      }
      setVknBagla(null);
      setCekmece(false);
      setFirmaId('');
      setFaturaNo('');
      setAciklama('');
      setKategori('');
      setTutar('');
      setKdv('');
      setTur('');
      setDetay('');
      setFormKey((k) => k + 1);
      if (aktarilan) {
        onXmlKullanildi(aktarilan.id);
        setAktarilan(null);
      }
    } catch (e) {
      bildir(e.message, true);
    } finally {
      setKaydediyor(false);
    }
  }

  return (
    <>
      <div className="m2-fis-baslik">
        <h2>Fatura / Fiş Girişi</h2>
        <button type="button" className="m2-xc-ac" onClick={onXmlAc} title="Yüklenen e-faturalardan formu doldur">
          <FileUp size={14} /> XML faturalar {xmlBekleyen > 0 && <b>{xmlBekleyen}</b>}
        </button>
      </div>
      {aktarilan && (
        <div className="m2-xml-not">
          <span>
            XML'den aktarıldı: {aktarilan.tedarikciAdi} · No {aktarilan.faturaNo}. Alanları kontrol edip kaydedin; ödeme türünü siz seçin.
          </span>
          <button type="button" onClick={() => { setAktarilan(null); setVknBagla(null); }}>Vazgeç</button>
        </div>
      )}

      <div className={`m2-toggle ${iade ? 'odeme' : ''}`} role="group" aria-label="Evrak türü">
        <span className="m2-toggle-thumb" />
        <button type="button" className={iade ? '' : 'on'} onClick={() => setIade(false)}>
          Fatura/Fiş
        </button>
        <button type="button" className={iade ? 'on' : ''} onClick={() => setIade(true)}>
          İade Faturası
        </button>
      </div>
      <p className="m2-hint">{iade ? FATURA_ACIKLAMA.iade : FATURA_ACIKLAMA.fatura}</p>

      <label className="m2-label">Tarih</label>
      <input className="m2-input" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />

      <label className="m2-label">
        Firma <b>*</b>
      </label>
      <FirmaSecici
        key={formKey}
        firmalar={veri.firmalar}
        valueId={firmaId}
        onChange={firmaSec}
        onYeni={(ad) => onModal({ tur: 'firma', ad: ad || (vknBagla ? firmaAdiOner(vknBagla.unvan) : ''), vkn: vknBagla ? vknBagla.vkn : '', unvan: vknBagla ? vknBagla.unvan : '', bitince: (f) => firmaSec(f.id, f) })}
      />
      {vknBagla && (
        <label className="m2-vkn-bagla">
          <input type="checkbox" checked={vknBagla.isaret} onChange={(e) => setVknBagla({ ...vknBagla, isaret: e.target.checked })} />
          <span>
            Bu faturadaki VKN'yi ({vknBagla.vkn}) seçtiğim firmaya hep bağla
            {!firmaId && <em> — önce firmayı seçin ya da yeni firma ekleyin</em>}
          </span>
        </label>
      )}
      {firma && <div className={`m2-info ${bakiyeEtiketi(firma.bakiye).ton}`}>Şu an: {bakiyeEtiketi(firma.bakiye).metin}</div>}

      <label className="m2-label">{iade ? 'İlgili / İade Fatura No' : 'Fatura No'}</label>
      <input className="m2-input" placeholder="Opsiyonel" value={faturaNo} onChange={(e) => setFaturaNo(e.target.value)} />

      <label className="m2-label">Açıklama</label>
      <input className="m2-input" placeholder="Opsiyonel" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />

      <label className="m2-label">Gider Kategorisi</label>
      <div className="m2-row">
        <div className="m2-grow">
          <select className="m2-select" value={kategori} onChange={(e) => setKategori(e.target.value)}>
            <option value="">— Seçin —</option>
            {veri.kategoriler.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="m2-btn sec mini"
          onClick={() => onModal({ tur: 'kategori', bitince: (k) => setKategori(k) })}
        >
          <Plus size={14} style={{ verticalAlign: '-2px' }} /> Yeni
        </button>
      </div>

      <label className="m2-label">{iade ? 'İade Şekli' : 'Ödeme Türü'}</label>
      <OdemeSecimi
        turler={FATURA_ODEME_TURLERI}
        tur={tur}
        detay={detay}
        onChange={(a, b) => {
          setTur(a);
          setDetay(b);
        }}
        yontemler={veri.odemeYontemleri}
        onYeni={(odemeTuru) => onModal({ tur: 'yontem', odemeTuru, bitince: (y) => { setTur(y.odeme_turu); setDetay(y.ad); } })}
        cariNotu={iade ? 'Cari olarak kaydedilir; firmanın borcundan düşer, para hareketi olmaz.' : 'Cari olarak kaydedilir; firmanın borcuna eklenir.'}
      />
      {tur === 'Nakit' && !iade && tarih === veri.bugun && <CekmeceKutusu deger={cekmece} onChange={setCekmece} />}

      <label className="m2-label">
        {iade ? 'İade Tutarı (KDV dahil)' : 'Fatura Tutarı (KDV dahil)'} <b>*</b>
      </label>
      <input
        className="m2-input"
        type="number"
        step="any"
        min="0"
        placeholder="0,00"
        value={tutar}
        onChange={(e) => setTutar(e.target.value)}
      />

      <label className="m2-label">KDV Tutarı</label>
      <input
        className="m2-input"
        type="number"
        step="any"
        min="0"
        placeholder="Opsiyonel — tutarın içindeki KDV (TL)"
        value={kdv}
        onChange={(e) => setKdv(e.target.value)}
      />

      {firma && t > 0 && tur === 'Cari' && (
        <div className={`m2-info ${bakiyeEtiketi(iade ? firma.bakiye - t : firma.bakiye + t).ton}`}>
          Bu kayıttan sonra: {bakiyeEtiketi(iade ? firma.bakiye - t : firma.bakiye + t).metin}
        </div>
      )}
      {firma && t > 0 && tur && tur !== 'Cari' && detay && !iade && (
        <div className="m2-info">
          Otomatik oluşur: {firma.ad} için Ödeme Makbuzu ve {detay} için Tahsilat Makbuzu. {firma.ad} bakiyesi değişmez.
        </div>
      )}
      {firma && t > 0 && tur && tur !== 'Cari' && detay && iade && (
        <div className="m2-info">
          Otomatik oluşur: {firma.ad} için Tahsilat Makbuzu ve {detay} için Ödeme Makbuzu (para size geri girer). {firma.ad} bakiyesi değişmez.
        </div>
      )}

      <button className="m2-btn full" disabled={kaydediyor} onClick={kaydet}>
        {kaydediyor ? 'Kaydediliyor…' : iade ? 'İade Faturasını Kaydet' : 'Kaydet'}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Makbuz: Tahsilat / Ödeme
// ---------------------------------------------------------------------------
const FATURA_ACIKLAMA = {
  fatura: 'Firmadan gelen fatura veya fiş. Cari seçilirse firmanın borcuna eklenir.',
  iade: 'Faturadaki gelmeyen veya iade edilen kalemin tutarını ARTI olarak yazın; sistem eksi (borçtan düşen) olarak işler. Cari seçilirse firmanın borcundan düşer; Nakit, Banka veya Kart seçilirse para size geri gelmiş sayılır.',
};
const MAKBUZ_ACIKLAMA = {
  Tahsilat: 'Borcu olan cariden aldığınız ödeme. Tutar carinin borcundan düşer.',
  Ödeme: 'Borcunuz olan cariye yaptığınız ödeme. Tutar sizin borcunuzdan düşer.',
};

function MakbuzFormu({ veri, bildir, onKaydet, onModal }) {
  const [cekmece, setCekmece] = useState(false); // nakit ödeme çekmeceden verildi (günlük kasa)
  const [makbuzTuru, setMakbuzTuru] = useState('Tahsilat');
  const [tarih, setTarih] = useState(veri.bugun || bugunISO());
  const [firmaId, setFirmaId] = useState('');
  const [faturaNo, setFaturaNo] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [tur, setTur] = useState('');
  const [detay, setDetay] = useState('');
  const [tutar, setTutar] = useState('');
  const [kaydediyor, setKaydediyor] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const firma = veri.firmalar.find((f) => f.id === firmaId) || null;
  const t = sayi(tutar);
  const tahsilat = makbuzTuru === 'Tahsilat';
  // Tahsilat: firmanın bize olan borcu düşer (bakiye artar). Ödeme: bizim borcumuz düşer (bakiye azalır).
  const yeniBakiye = firma ? firma.bakiye + (tahsilat ? t : -t) : 0;

  async function kaydet() {
    if (!tarih) return bildir('Tarih seçin', true);
    if (!firmaId) return bildir('Firma seçin', true);
    if (!(t > 0)) return bildir('Tutarı girin', true);
    const y = yontemPayload(tur, detay);
    if (y.hata) return bildir(y.hata, true);
    setKaydediyor(true);
    try {
      await onKaydet({ makbuzTuru, tarih, firmaId, faturaNo, aciklama, tutar, ...(cekmece && makbuzTuru === 'Ödeme' && tur === 'Nakit' && tarih === veri.bugun ? { kasaGrubu: 'gunluk' } : {}), ...y });
      setCekmece(false);
      setFirmaId('');
      setFaturaNo('');
      setAciklama('');
      setTur('');
      setDetay('');
      setTutar('');
      setFormKey((k) => k + 1);
    } catch (e) {
      bildir(e.message, true);
    } finally {
      setKaydediyor(false);
    }
  }

  return (
    <>
      <h2>Makbuz</h2>

      <div className={`m2-toggle ${tahsilat ? '' : 'odeme'}`} role="group" aria-label="Makbuz türü">
        <span className="m2-toggle-thumb" />
        <button type="button" className={tahsilat ? 'on' : ''} onClick={() => setMakbuzTuru('Tahsilat')}>
          Tahsilat Makbuzu
        </button>
        <button type="button" className={tahsilat ? '' : 'on'} onClick={() => setMakbuzTuru('Ödeme')}>
          Ödeme Makbuzu
        </button>
      </div>
      <p className="m2-hint">{MAKBUZ_ACIKLAMA[makbuzTuru]}</p>

      <label className="m2-label">Tarih</label>
      <input className="m2-input" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />

      <label className="m2-label">
        Firma <b>*</b>
      </label>
      <FirmaSecici
        key={formKey}
        firmalar={veri.firmalar}
        valueId={firmaId}
        onChange={setFirmaId}
        onYeni={(ad) => onModal({ tur: 'firma', ad, bitince: (f) => setFirmaId(f.id) })}
      />
      {firma && <div className={`m2-info ${bakiyeEtiketi(firma.bakiye).ton}`}>Şu an: {bakiyeEtiketi(firma.bakiye).metin}</div>}
      {firma && tahsilat && firma.bakiye > 0.005 && (
        <div className="m2-info r">Bu firmaya borcunuz görünüyor; tahsilat girerseniz borcunuz artar. Ödeme Makbuzu mu istediniz?</div>
      )}
      {firma && !tahsilat && firma.bakiye < -0.005 && (
        <div className="m2-info r">Bu firma size borçlu görünüyor; ödeme girerseniz borcu artar. Tahsilat Makbuzu mu istediniz?</div>
      )}

      <label className="m2-label">Fatura No</label>
      <input className="m2-input" placeholder="Opsiyonel" value={faturaNo} onChange={(e) => setFaturaNo(e.target.value)} />

      <label className="m2-label">Açıklama</label>
      <input className="m2-input" placeholder="Opsiyonel" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />

      <label className="m2-label">Ödeme Türü</label>
      <OdemeSecimi
        turler={MAKBUZ_ODEME_TURLERI}
        tur={tur}
        detay={detay}
        onChange={(a, b) => {
          setTur(a);
          setDetay(b);
        }}
        yontemler={veri.odemeYontemleri}
        onYeni={(odemeTuru) => onModal({ tur: 'yontem', odemeTuru, bitince: (y) => { setTur(y.odeme_turu); setDetay(y.ad); } })}
      />
      {tur === 'Nakit' && makbuzTuru === 'Ödeme' && tarih === veri.bugun && <CekmeceKutusu deger={cekmece} onChange={setCekmece} />}

      {tur && detay && (
        <p className="m2-hint">
          Otomatik: {detay} carisine {tahsilat ? 'Ödeme' : 'Tahsilat'} Makbuzu yazılır.
        </p>
      )}

      <label className="m2-label">
        {tahsilat ? 'Tahsilat Tutarı' : 'Ödeme Tutarı'} <b>*</b>
      </label>
      <input
        className="m2-input"
        type="number"
        step="any"
        min="0"
        placeholder="0,00"
        value={tutar}
        onChange={(e) => setTutar(e.target.value)}
      />

      {firma && t > 0 && (
        <div className={`m2-info ${bakiyeEtiketi(yeniBakiye).ton}`}>
          Bu makbuzdan sonra: {bakiyeEtiketi(yeniBakiye).metin}
        </div>
      )}

      <button className="m2-btn full" disabled={kaydediyor} onClick={kaydet}>
        {kaydediyor ? 'Kaydediliyor…' : `${makbuzTuru} Makbuzunu Kaydet`}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Datalar: bütün fatura/fiş ve makbuz kayıtları, Excel düzeninde (sadece görüntüleme)
// Excel tarzı filtreler: Tarih (yıl > ay > gün, çoklu seçim) ve diğer sütunlar.
// Varsayılan: içinde bulunulan ay. Tüm kayıtlar yüklenir, filtre bunların üzerinde çalışır.
// ---------------------------------------------------------------------------
const DATALAR_SUTUNLAR = [
  { baslik: 'Tarih', filtre: 'tarih' },
  { baslik: 'Evrak Türü', filtre: 'evrakTuru' },
  { baslik: 'Firma Adı', filtre: 'firmaAdi' },
  { baslik: 'Fatura No' },
  { baslik: 'Açıklama' },
  { baslik: 'Gider Kategorisi', filtre: 'giderKategorisi' },
  { baslik: 'Ödeme Türü', filtre: 'odemeTuru' },
  { baslik: 'Ödeme Şekli', filtre: 'odemeSekli' },
  { baslik: 'Tutar', sayi: true },
  { baslik: 'KDV', sayi: true },
  { baslik: 'Tahsilat', sayi: true },
  { baslik: 'Ödeme (Tediye)', sayi: true },
];
const EVRAK_SINIFI = {
  'Fatura/Fiş': 'fatura',
  'İade Faturası': 'iade',
  'Tahsilat Makbuzu': 'tahsilat',
  'Ödeme (Tediye) Makbuzu': 'tediye',
};

function DatalarSekmesi({ aktif, duzenlemeModu, veri, bildir, yenile, onIslem, onDegisti }) {
  // Telefonda Tutar/Tahsilat/Ödeme tek "Miktar" sütununda da gösterilir (masaüstünde bu sütun yok)
  const mobil = useIsMobile();
  const [kayitlar, setKayitlar] = useState(null);
  const [sinirli, setSinirli] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState('');
  const [secim, setSecim] = useState(bosSecimler());
  const [menu, setMenu] = useState(null); // { anahtar, top, left }
  const tarihDokunuldu = useRef(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const j = await api('datalar');
      const liste = j.kayitlar || [];
      setKayitlar(liste);
      setSinirli(!!j.sinirli);
      // Kullanıcı tarih filtresine dokunmadıysa varsayılan (bu ay) her yüklemede güncellenir.
      if (!tarihDokunuldu.current) setSecim((s) => ({ ...s, tarih: varsayilanTarihSecimi(liste, bugunISO()) }));
      setHata('');
    } catch (e) {
      setHata(e.message);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  // Sekme her açıldığında (ve geri/ileri alınca) güncel kayıtlar çekilir.
  useEffect(() => {
    if (aktif) yukle();
  }, [aktif, yukle, yenile]);

  const degerler = useMemo(() => {
    const o = {};
    const liste = kayitlar || [];
    FILTRE_KOLONLARI.forEach(({ anahtar }) => {
      if (anahtar === 'tarih') {
        o.tarih = [...new Set(liste.map((r) => r.tarih).filter(Boolean))].sort();
      } else {
        o[anahtar] = [...new Set(liste.map((r) => r[anahtar] ?? ''))].sort((a, b) => a.localeCompare(b, 'tr'));
      }
    });
    return o;
  }, [kayitlar]);
  const gorunen = useMemo(() => filtreUygula(kayitlar || [], secim), [kayitlar, secim]);
  const filtreAktif = Object.values(secim).some(Boolean);

  function secimDegistir(anahtar, yeni) {
    if (anahtar === 'tarih') tarihDokunuldu.current = true;
    setSecim((s) => ({ ...s, [anahtar]: yeni }));
  }
  // "Bu ay" yalnızca TARİH filtresini varsayılana (içinde bulunulan ay) döndürür; diğer sütun filtreleri korunur.
  function buAy() {
    tarihDokunuldu.current = false;
    setSecim((s) => ({ ...s, tarih: varsayilanTarihSecimi(kayitlar || [], bugunISO()) }));
  }
  function filtreleriTemizle() {
    tarihDokunuldu.current = true;
    setSecim(bosSecimler());
  }
  function menuAc(e, anahtar) {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu((m) =>
      m && m.anahtar === anahtar ? null : { anahtar, top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 300)) },
    );
  }
  const menuKolon = menu ? FILTRE_KOLONLARI.find((k) => k.anahtar === menu.anahtar) : null;

  // ---- Düzenleme Modu: hücre düzeltme, satır düzenle/sil (grubun TAMAMI birlikte değişir) ----
  const [duzenleGrup, setDuzenleGrup] = useState(null);
  const [kaynakDuzenle, setKaynakDuzenle] = useState(null);
  async function islemYap(govde, kaynak, etiket, ekle) {
    try {
      const j = await api(kaynak, { method: 'POST', body: govde });
      onIslem(j, etiket);
      if (ekle) bildir(ekle);
      await yukle();
      await onDegisti?.();
      return j;
    } catch (e) {
      bildir(e.message, true);
      return null;
    }
  }
  // Datalar bilgi merkezidir: tüm kaynaklar buradan düzenlenir/silinir; bağlı kaynak kaydı (avans, izin, tahakkuk, yemek kartı,
  // günsonu, devir) aynı işlemde sunucuda güncellenir ve satıra "elle" işareti düşer.
  const tutarDeger = (r) => Math.abs(r.tutar ?? r.tahsilat ?? r.odemeTediye ?? 0);
  const tutarAlani = (r) => (r.tutar != null ? 'tutar' : r.tahsilat != null ? 'tahsilat' : r.odemeTediye != null ? 'odemeTediye' : null);
  const anaSatirMi = (r) => {
    const grup = (kayitlar || []).filter((x) => x.grupId === r.grupId);
    const ana = grup.find((x) => x.evrakTuru === 'Fatura/Fiş' || x.evrakTuru === 'İade Faturası') || grup.find((x) => !x.otomatik);
    return !!ana && ana.id === r.id;
  };
  const kaynakVar = (r) => !!r.kaynak;
  const tutarDuzenlenir = (r) => kaynakVar(r) && tutarAlani(r) === 'tutar' && r.tutar !== 0;
  const tarihDuzenlenir = (r) => kaynakVar(r) && r.kaynak !== 'gunsonu' && r.kaynak !== 'izin';
  const aciklamaDuzenlenir = (r) => kaynakVar(r) && !['gunsonu', 'izin'].includes(r.kaynak) && !r.otomatik && (r.kaynak !== 'hizli_gider' || anaSatirMi(r));
  const kategoriDuzenlenir = (r) => kaynakVar(r) && !['gunsonu', 'avans'].includes(r.kaynak) && (r.evrakTuru === 'Fatura/Fiş' || r.evrakTuru === 'İade Faturası');
  const kdvDuzenlenir = (r) => kaynakVar(r) && !['gunsonu', 'avans'].includes(r.kaynak) && r.kdv != null && (r.evrakTuru === 'Fatura/Fiş' || r.evrakTuru === 'İade Faturası');
  const kasaDuzenlenir = (r) => (r.kaynak === 'hizli_gider' || r.kaynak === 'avans') && !!r.kasaGrubu;
  const kaynakDegistir = (r, alan, deger, etiket) =>
    islemYap({ satirId: r.id, grupId: r.grupId, alan, deger }, 'datalarDegistir', `${etiket}`, 'Güncellendi; bağlı kaynak kaydı ve Günsonları/devir yeniden hesaplandı');
  const alanDegistir = (r, alan, deger, etiket) => islemYap({ grupId: r.grupId, satirId: r.id, alan, deger }, 'kayitAlan', etiket);
  const degistir = (r, alan, deger, etiket) => (kaynakVar(r) ? kaynakDegistir(r, alan, deger, etiket) : alanDegistir(r, alan, deger, etiket));
  const KAYNAK_UYARI = {
    avans: 'Personel avans kaydı da silinir (geri alınamaz).',
    yemek_karti: 'Yemek kartı kesim/ödeme kaydı da silinir (geri alınamaz).',
    tahakkuk: 'Tahakkuk kalemi/toplamı da güncellenir (geri alınamaz).',
    devir: 'Devir kaydı silinir (geri alınamaz).',
    hizli_gider: 'Günsonları ve devir yeniden hesaplanır.',
  };
  async function kaynakSil(r) {
    const grup = (kayitlar || []).filter((x) => x.grupId === r.grupId);
    const ek = KAYNAK_UYARI[r.kaynak] ? `\n\n${KAYNAK_UYARI[r.kaynak]}` : '';
    const mesaj =
      r.kaynak === 'hizli_gider' && grup.length > 1
        ? `Bu harcama ${grup.length} satırdan oluşuyor:\n• ${grup.map((x) => x.evrakTuru).join('\n• ')}\n\nHepsi silinecek.${ek}\nEmin misiniz?`
        : `${r.firmaAdi} — ${r.evrakTuru} kaydı silinecek.${ek}\nEmin misiniz?`;
    if (!window.confirm(mesaj)) return;
    const j = await islemYap({ satirId: r.id, grupId: r.grupId }, 'datalarSil', `${r.firmaAdi} kaydı silindi`, 'Kayıt silindi; bağlı kaynak kaydı da güncellendi');
    // yalnızca hızlı gider silme geri alınabilir (diğerleri kaynak tablolarını da etkilediği için)
    if (j && r.kaynak === 'hizli_gider' && j.oncesi) onIslem({ hizliSil: { grupId: r.grupId, oncesi: j.oncesi } }, `${r.firmaAdi} harcaması silindi`);
  }
  function grupSil(r) {
    const grup = (kayitlar || []).filter((x) => x.grupId === r.grupId);
    const mesaj =
      grup.length > 1
        ? `Bu kayıt ${grup.length} satırdan oluşuyor:\n• ${grup.map((x) => x.evrakTuru).join('\n• ')}\n\nHepsi silinecek. Emin misiniz?`
        : `${r.firmaAdi} — ${r.evrakTuru} kaydı silinecek. Emin misiniz?`;
    if (window.confirm(mesaj)) islemYap({ grupId: r.grupId }, 'kayitSil', `${r.firmaAdi} kaydı silindi`, 'Kayıt silindi (Ctrl+Z ile geri alabilirsiniz)');
  }
  const kategoriler = veri?.kategoriler || [];

  const para = (n) => (n === null || n === undefined ? '' : sayiFmt.format(n));

  return (
    <div className="m2-card">
      <div className="m2-row" style={{ justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Datalar</h2>
        <div className="m2-row" style={{ flexWrap: 'wrap' }}>
          {kayitlar && (
            <span className="m2-hint" style={{ margin: 0 }}>
              {gorunen.length} / {kayitlar.length} kayıt{sinirli ? ' (en yeni 20.000 yüklendi)' : ''}
            </span>
          )}
          <button className="m2-btn sec mini" onClick={buAy}>
            Bu ay
          </button>
          <button className="m2-btn sec mini" onClick={filtreleriTemizle} disabled={!filtreAktif}>
            Filtreleri temizle
          </button>
          <button className="m2-btn sec mini" onClick={yukle} disabled={yukleniyor}>
            {yukleniyor ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>
      </div>

      {hata && <div className="m2-info r">{hata}</div>}

      <div className="m2-table-wrap">
        <table className="m2-table m2-datalar">
          <thead>
            <tr>
              {DATALAR_SUTUNLAR.map((s) => (
                <th key={s.baslik} className={s.sayi ? 'sayi' : ''}>
                  <div className="m2-th">
                    <span>{s.baslik}</span>
                    {s.filtre && (
                      <button
                        type="button"
                        data-filtre-dugme
                        className={`m2-fb ${secim[s.filtre] ? 'on' : ''}`}
                        aria-label={`${s.baslik} filtresi`}
                        onClick={(e) => menuAc(e, s.filtre)}
                      >
                        <Filter size={12} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              {mobil && <th className="sayi">Miktar</th>}
              {duzenlemeModu && <th>İşlem</th>}
            </tr>
          </thead>
          <tbody>
            {kayitlar && kayitlar.length === 0 && (
              <tr>
                <td colSpan={DATALAR_SUTUNLAR.length + (duzenlemeModu ? 1 : 0) + (mobil ? 1 : 0)} className="m2-empty">
                  Henüz kayıt yok.
                </td>
              </tr>
            )}
            {kayitlar && kayitlar.length > 0 && gorunen.length === 0 && (
              <tr>
                <td colSpan={DATALAR_SUTUNLAR.length + (duzenlemeModu ? 1 : 0) + (mobil ? 1 : 0)} className="m2-empty">
                  Seçili filtrelere uyan kayıt yok. Tarih filtresinden başka bir ay seçebilir veya "Filtreleri temizle"ye basabilirsiniz.
                </td>
              </tr>
            )}
            {gorunen.map((r) => (
              <tr key={r.id} className={r.otomatik ? 'oto' : ''}>
                <td className="nowrap">
                  <DuzenlenebilirHucre aktif={duzenlemeModu && (!r.kaynak || tarihDuzenlenir(r))} tur="date" deger={r.tarih} metin={tarihTR(r.tarih)} onKaydet={(v) => degistir(r, 'tarih', v, 'tarih değişikliği')} />
                </td>
                <td className="nowrap">
                  <span className={`m2-badge ${EVRAK_SINIFI[r.evrakTuru] || ''}`}>{r.evrakTuru}</span>
                </td>
                <td>
                  {r.firmaAdi}
                  {r.elleDegisti && (
                    <span className="m2-elle" title="Bu kayıt Datalar'dan elle değiştirildi">
                      {' '}✎ elle
                    </span>
                  )}
                </td>
                <td>
                  <DuzenlenebilirHucre aktif={duzenlemeModu && !r.kaynak} deger={r.faturaNo} metin={r.faturaNo} onKaydet={(v) => alanDegistir(r, 'faturaNo', v, 'fatura no değişikliği')} />
                </td>
                <td>
                  <DuzenlenebilirHucre aktif={duzenlemeModu && ((!r.kaynak && !r.otomatik) || aciklamaDuzenlenir(r))} deger={r.aciklama} metin={r.aciklama} onKaydet={(v) => degistir(r, 'aciklama', v, 'açıklama değişikliği')} />
                </td>
                <td>
                  <DuzenlenebilirHucre
                    aktif={duzenlemeModu && (kaynakVar(r) ? kategoriDuzenlenir(r) : r.evrakTuru === 'Fatura/Fiş' || r.evrakTuru === 'İade Faturası')}
                    tur="select"
                    secenekler={kategoriler}
                    deger={r.giderKategorisi}
                    metin={r.giderKategorisi}
                    onKaydet={(v) => degistir(r, 'giderKategorisi', v, 'kategori değişikliği')}
                  />
                </td>
                <td className="nowrap">{r.odemeTuru}</td>
                <td className="nowrap">
                  <DuzenlenebilirHucre
                    aktif={duzenlemeModu && kasaDuzenlenir(r)}
                    tur="select"
                    secenekler={['gunluk', 'ana']}
                    deger={r.kasaGrubu}
                    metin={r.odemeSekli}
                    onKaydet={(v) => kaynakDegistir(r, 'kasaGrubu', v, 'kasa değişikliği')}
                  />
                  {kasaDuzenlenir(r) && duzenlemeModu && r.kasaGrubu && <span className="m2-elle"> ({r.kasaGrubu === 'gunluk' ? 'günlük' : 'ana'} kasa)</span>}
                </td>
                <td className={`sayi ${r.tutar < 0 ? 'm2-neg' : ''}`}>
                  <DuzenlenebilirHucre aktif={duzenlemeModu && tutarDuzenlenir(r)} deger={String(tutarDeger(r))} metin={para(r.tutar)} onKaydet={(v) => kaynakDegistir(r, 'tutar', v, 'tutar değişikliği')} />
                </td>
                <td className={`sayi ${r.kdv < 0 ? 'm2-neg' : ''}`}>
                  <DuzenlenebilirHucre aktif={duzenlemeModu && kdvDuzenlenir(r)} deger={r.kdv == null ? '' : String(Math.abs(r.kdv))} metin={para(r.kdv)} onKaydet={(v) => kaynakDegistir(r, 'kdv', v, 'KDV değişikliği')} />
                </td>
                <td className="sayi">
                  <DuzenlenebilirHucre aktif={duzenlemeModu && kaynakVar(r) && r.tutar == null && r.tahsilat != null} deger={String(tutarDeger(r))} metin={para(r.tahsilat)} onKaydet={(v) => kaynakDegistir(r, 'tutar', v, 'tutar değişikliği')} />
                </td>
                <td className="sayi">
                  <DuzenlenebilirHucre aktif={duzenlemeModu && kaynakVar(r) && r.tutar == null && r.tahsilat == null && r.odemeTediye != null} deger={String(tutarDeger(r))} metin={para(r.odemeTediye)} onKaydet={(v) => kaynakDegistir(r, 'tutar', v, 'tutar değişikliği')} />
                </td>
                {mobil && (() => {
                  const m = [r.tutar, r.tahsilat, r.odemeTediye].find((x) => x !== null && x !== undefined && x !== 0);
                  return <td className={`sayi ${m < 0 ? 'm2-neg' : ''}`}>{para(m)}</td>;
                })()}
                {duzenlemeModu && (
                  <td className="m2-islem-td">
                    {r.kaynak === 'izin' || r.kaynak === 'gunsonu' ? (
                      <div className="m2-yk-islem">
                        <button className="m2-btn sec mini" onClick={() => setKaynakDuzenle(r)}>
                          Düzenle
                        </button>
                        <span className="m2-kilit" title={r.kaynak === 'izin' ? "İzin silme Personel Klasörü'nden" : 'Günsonu silme Günsonları sekmesinden'}>
                          🔒 {KAYNAK_ETIKET[r.kaynak] || r.kaynak}
                        </span>
                      </div>
                    ) : r.kaynak ? (
                      <div className="m2-yk-islem">
                        <button className="m2-btn sec mini" onClick={() => setKaynakDuzenle(r)}>
                          Düzenle
                        </button>
                        <button className="m2-btn sec mini" onClick={() => kaynakSil(r)}>
                          Sil
                        </button>
                      </div>
                    ) : (
                      <div className="m2-yk-islem">
                        <button className="m2-btn sec mini" onClick={() => setDuzenleGrup(r.grupId)}>
                          Düzenle
                        </button>
                        <button className="m2-btn sec mini" onClick={() => grupSil(r)}>
                          Sil
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {kaynakDuzenle && (
        <KaynakDuzenleModal
          satir={kaynakDuzenle}
          kategoriler={kategoriler}
          kategoriAktif={kategoriDuzenlenir(kaynakDuzenle)}
          kdvAktif={kdvDuzenlenir(kaynakDuzenle)}
          tarihAktif={tarihDuzenlenir(kaynakDuzenle)}
          aciklamaAktif={aciklamaDuzenlenir(kaynakDuzenle)}
          tutarAktif={tutarAlani(kaynakDuzenle) !== null}
          kasaAktif={kasaDuzenlenir(kaynakDuzenle)}
          tutarDeger={tutarDeger(kaynakDuzenle)}
          onKapat={() => setKaynakDuzenle(null)}
          onKaydet={async (degisimler) => {
            for (const d of degisimler) {
              const j = await islemYap({ satirId: kaynakDuzenle.id, grupId: kaynakDuzenle.grupId, alan: d.alan, deger: d.deger }, 'datalarDegistir', d.etiket);
              if (!j) return false;
            }
            bildir('Güncellendi; bağlı kaynak kaydı ve Günsonları/devir yeniden hesaplandı');
            return true;
          }}
        />
      )}

      {duzenleGrup && (
        <KayitDuzenleModal
          grupId={duzenleGrup}
          veri={veri}
          bildir={bildir}
          onKaydet={async (payload) => {
            const j = await api('kayitDuzenle', { method: 'POST', body: payload });
            onIslem(j, 'kayıt düzenleme');
            bildir('Kayıt güncellendi (Ctrl+Z ile geri alabilirsiniz)');
            await yukle();
            await onDegisti?.();
          }}
          onKapat={() => setDuzenleGrup(null)}
        />
      )}
      {menu && menuKolon && (
        <FiltreMenu
          kolon={menuKolon}
          konum={menu}
          degerler={degerler[menu.anahtar] || []}
          secili={secim[menu.anahtar]}
          onChange={(yeni) => secimDegistir(menu.anahtar, yeni)}
          onKapat={() => setMenu(null)}
          bugun={bugunISO()}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hesap Özetleri: cari kartları, filtreler, düzenleme, ekstre penceresi ve PDF
// Bakiye = Borç - Alacak. Alacak = fatura/fiş + tahsilat, Borç = ödeme (tediye).
// Eksi bakiye = firma ALACAKLI (borcumuz var), artı bakiye = firma BORÇLU (bize borçlu).
// ---------------------------------------------------------------------------
const DURUM_ETIKET = { alacakli: 'Alacaklı', borclu: 'Borçlu', yok: 'Bakiye yok' };

function kartYardim(bolum, durum) {
  if (durum === 'yok') return '';
  if (bolum === 'kasaBanka') return durum === 'alacakli' ? 'net para çıkışı' : 'net para girişi';
  return durum === 'alacakli' ? 'borcumuz var' : 'bize borçlu';
}
function bugunTRMetin() {
  return tarihTR(bugunISO());
}

// Hesap Özetleri grup filtresi: cari grubu (sunucudaki f.grup) -> ekrandaki grup.
const HESAP_GRUPLARI = [
  { anahtar: 'bankaKart', etiket: 'Banka ve Kartlar', gruplar: ['Kasa', 'Banka', 'Kredi Kartı', 'Ödeme şekli'] },
  { anahtar: 'ortaklar', etiket: 'Ortaklar', gruplar: ['Cepten'] },
  { anahtar: 'yemek', etiket: 'Yemek Kartları', gruplar: ['Yemek Kartı'] },
  { anahtar: 'personel', etiket: 'Personel', gruplar: ['Personel'] },
  { anahtar: 'sabit', etiket: 'Sabit Giderler', gruplar: ['Sabit Gider'] },
  { anahtar: 'cariler', etiket: 'Cariler', gruplar: ['Firma'] },
];

function HesapOzetleriSekmesi({ aktif, bildir, onDegisti }) {
  const [firmalar, setFirmalar] = useState(null);
  const [kategoriler, setKategoriler] = useState([]);
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [ara, setAra] = useState('');
  const [durum, setDurum] = useState('tumu'); // tumu | alacakli | borclu | yok
  const [bolum, setBolum] = useState('tumu'); // tumu | HESAP_GRUPLARI anahtarı
  const [bakiyesizGizle, setBakiyesizGizle] = useState(false);
  const [sirala, setSirala] = useState('bakiye'); // bakiye | ad | son
  const [ekstreFirma, setEkstreFirma] = useState(null);
  const [duzenle, setDuzenle] = useState(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const j = await api('hesapOzetleri');
      setFirmalar(j.firmalar || []);
      setKategoriler(j.kategoriler || []);
      setHata('');
    } catch (e) {
      setHata(e.message);
    } finally {
      setYukleniyor(false);
    }
  }, []);

  // Sekme her açıldığında güncel bakiyeler çekilir.
  useEffect(() => {
    if (aktif) yukle();
  }, [aktif, yukle]);

  const ozet = useMemo(() => {
    const liste = firmalar || [];
    const cariler = liste.filter((f) => f.bolum === 'cariler');
    const alacakli = cariler.filter((f) => durumBul(f.bakiye) === 'alacakli');
    const borclu = cariler.filter((f) => durumBul(f.bakiye) === 'borclu');
    const topla = (l) => Math.round(l.reduce((a, f) => a + Math.abs(f.bakiye) * 100, 0)) / 100;
    const kasaNet = Math.round(liste.filter((f) => f.bolum === 'kasaBanka').reduce((a, f) => a + f.bakiye * 100, 0)) / 100;
    return { alacakliToplam: topla(alacakli), alacakliSayi: alacakli.length, borcluToplam: topla(borclu), borcluSayi: borclu.length, kasaNet };
  }, [firmalar]);

  const gorunen = useMemo(() => {
    let l = firmalar || [];
    const q = trNorm(ara);
    if (q) l = l.filter((f) => trNorm(f.ad).includes(q));
    if (bolum !== 'tumu') {
      const g = HESAP_GRUPLARI.find((x) => x.anahtar === bolum);
      if (g) l = l.filter((f) => g.gruplar.includes(f.grup));
    }
    if (durum !== 'tumu') l = l.filter((f) => durumBul(f.bakiye) === durum);
    if (bakiyesizGizle) l = l.filter((f) => durumBul(f.bakiye) !== 'yok');
    const ad = (a, b) => a.ad.localeCompare(b.ad, 'tr');
    return [...l].sort((a, b) => {
      if (sirala === 'ad') return ad(a, b);
      if (sirala === 'son') {
        if (a.sonIslem === b.sonIslem) return ad(a, b);
        if (!a.sonIslem) return 1;
        if (!b.sonIslem) return -1;
        return a.sonIslem < b.sonIslem ? 1 : -1;
      }
      const fark = Math.abs(b.bakiye) - Math.abs(a.bakiye);
      return fark !== 0 ? fark : ad(a, b);
    });
  }, [firmalar, ara, durum, bolum, bakiyesizGizle, sirala]);

  async function firmaGuncelle(payload) {
    await api('firmaGuncelle', { method: 'POST', body: payload });
    bildir('Cari bilgileri güncellendi');
    await yukle();
    await onDegisti?.();
  }

  const chip = (deger, secili, set, etiket) => (
    <button type="button" key={deger} className={`m2-chip ${secili === deger ? 'on' : ''}`} onClick={() => set(deger)}>
      {etiket}
    </button>
  );
  const kasaNetEtiket = ozet.kasaNet === 0 ? TL(0) : `${ozet.kasaNet > 0 ? '+' : '−'}${TL(Math.abs(ozet.kasaNet))}`;

  return (
    <div className="m2-card">
      <div className="m2-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Hesap Özetleri</h2>
        <button className="m2-btn sec mini" onClick={yukle} disabled={yukleniyor}>
          {yukleniyor ? 'Yükleniyor…' : 'Yenile'}
        </button>
      </div>

      {hata && <div className="m2-info r">{hata}</div>}

      <div className="m2-stats">
        <div className="m2-stat r">
          <span>Borcumuz olan cariler</span>
          <b>{TL(ozet.alacakliToplam)}</b>
          <small>{ozet.alacakliSayi} cari alacaklı</small>
        </div>
        <div className="m2-stat g">
          <span>Bize borçlu cariler</span>
          <b>{TL(ozet.borcluToplam)}</b>
          <small>{ozet.borcluSayi} cari borçlu</small>
        </div>
        <div className="m2-stat">
          <span>Kasa ve banka net hareketi</span>
          <b>{kasaNetEtiket}</b>
          <small>giren − çıkan para</small>
        </div>
      </div>

      <div className="m2-toolbar">
        <input className="m2-input m2-ara" placeholder="Cari ara…" value={ara} onChange={(e) => setAra(e.target.value)} />
        <div className="m2-chips tight">
          {chip('tumu', durum, setDurum, 'Tümü')}
          {chip('alacakli', durum, setDurum, 'Alacaklı')}
          {chip('borclu', durum, setDurum, 'Borçlu')}
          {chip('yok', durum, setDurum, 'Bakiyesiz')}
        </div>
        <div className="m2-chips tight sar">
          {chip('tumu', bolum, setBolum, 'Tüm gruplar')}
          {HESAP_GRUPLARI.map((g) => chip(g.anahtar, bolum, setBolum, g.etiket))}
        </div>
        <label className="m2-onay">
          <input type="checkbox" checked={bakiyesizGizle} onChange={(e) => setBakiyesizGizle(e.target.checked)} /> Bakiyesizleri gizle
        </label>
        <select className="m2-select m2-sirala" value={sirala} onChange={(e) => setSirala(e.target.value)} aria-label="Sıralama">
          <option value="bakiye">Bakiye (büyükten küçüğe)</option>
          <option value="ad">A-Z</option>
          <option value="son">Son işlem tarihi</option>
        </select>
      </div>

      <div className="m2-hint" style={{ margin: '12px 0 8px' }}>
        {firmalar ? `${gorunen.length} / ${firmalar.length} cari` : ''} — Alacaklı: firmanın bizden alacağı var (borcumuz var). Borçlu: firma bize borçlu.
      </div>

      {firmalar && gorunen.length === 0 && <div className="m2-empty">Bu filtreye uyan cari yok.</div>}

      <div className="m2-hc-grid">
        {gorunen.map((f) => {
          const d = durumBul(f.bakiye);
          return (
            <div
              key={f.id}
              className={`m2-hc-kart ${d}`}
              role="button"
              tabIndex={0}
              onClick={() => setEkstreFirma(f)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setEkstreFirma(f)}
            >
              <button
                type="button"
                className="m2-hc-duzenle"
                title="Cariyi düzenle"
                aria-label={`${f.ad} düzenle`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDuzenle(f);
                }}
              >
                <Pencil size={14} />
              </button>
              <div>
                <div className="m2-hc-ad">{f.ad}</div>
                <div className="m2-hc-tag">{f.grup}</div>
              </div>
              <div>
                <div className="m2-hc-tutar">{d === 'yok' ? '—' : TL(Math.abs(f.bakiye))}</div>
                <div className="m2-hc-durum">{DURUM_ETIKET[d]}</div>
                <div className="m2-hc-yardim">{kartYardim(f.bolum, d) || '\u00A0'}</div>
              </div>
            </div>
          );
        })}
      </div>

      {ekstreFirma && <EkstreModal firma={ekstreFirma} bildir={bildir} onKimlikDegisti={onDegisti} onKapat={() => setEkstreFirma(null)} />}
      {duzenle && (
        <FirmaDuzenleModal
          firma={duzenle}
          kategoriler={kategoriler}
          onKaydet={firmaGuncelle}
          onBitti={() => setDuzenle(null)}
          onKapat={() => setDuzenle(null)}
        />
      )}
    </div>
  );
}

function FirmaDuzenleModal({ firma, kategoriler, onKaydet, onBitti, onKapat }) {
  const [ad, setAd] = useState(firma.ad);
  const [kategori, setKategori] = useState(firma.varsayilanKategori || '');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);
  const odemeSekli = firma.firmaTuru === 'Ödeme Şekli';
  return (
    <ModalKabuk baslik="Cariyi Düzenle" onKapat={onKapat}>
      <label className="m2-label">Cari Adı</label>
      <input className="m2-input" autoFocus value={ad} onChange={(e) => setAd(e.target.value)} />
      <p className="m2-hint">
        Ad değişince tüm eski kayıtlarda (faturalar, makbuzlar, Datalar) yeni ad görünür.
        {odemeSekli ? ' Bu bir ödeme şekli: ödeme yöntemi listesindeki adı da değişir.' : ''}
      </p>
      <label className="m2-label">Varsayılan Gider Kategorisi</label>
      <select className="m2-select" value={kategori} onChange={(e) => setKategori(e.target.value)}>
        <option value="">— Yok —</option>
        {kategoriler.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <p className="m2-hint">Sadece fatura formunda otomatik seçilen kategoridir; eski faturaların kategorisini değiştirmez.</p>
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon
        onKapat={onKapat}
        devreDisi={!ad.trim()}
        bekliyor={bekliyor}
        onKaydet={() => calistir({ firmaId: firma.id, ad, varsayilanKategori: kategori })}
      />
    </ModalKabuk>
  );
}

// Ekstre penceresi: en yeni işlem üstte; PDF'te sıralama eskiden yeniye.
// Cari kartındaki "Fatura kimlikleri": XML faturalardan öğrenilen (ya da elle girilen) VKN/TCKN'ler.
function FaturaKimlikleri({ firmaId, ilk, bildir, onDegisti }) {
  const [liste, setListe] = useState(ilk);
  const [acik, setAcik] = useState(false);
  const [yeni, setYeni] = useState('');
  const [duzen, setDuzen] = useState(null); // { eski, vkn }
  const [bekliyor, setBekliyor] = useState(false);
  const gecerli = (v) => v.length === 10 || v.length === 11;

  async function kaydet({ vkn, unvan, eskiVkn }) {
    setBekliyor(true);
    try {
      let j = await api('firmaKimlikKaydet', { method: 'POST', body: { firmaId, vkn, unvan, eskiVkn } });
      if (!j.ok && j.cakisma) {
        if (!window.confirm(`Bu VKN/TCKN şu an "${j.cakisma.firmaAd}" firmasına bağlı. Bu firmaya taşınsın mı?`)) return false;
        j = await api('firmaKimlikKaydet', { method: 'POST', body: { firmaId, vkn, unvan, eskiVkn, tasi: true } });
      }
      setListe((l) => [...l.filter((x) => x.vkn !== vkn && x.vkn !== eskiVkn), { vkn, unvan: unvan || '' }]);
      if (onDegisti) onDegisti();
      return true;
    } catch (e) {
      bildir(e.message, true);
      return false;
    } finally {
      setBekliyor(false);
    }
  }
  async function sil(k) {
    if (!window.confirm(`${k.vkn} bu firmadan kaldırılsın mı? (Eski fiş/faturalara dokunulmaz; sonraki faturalar kendiliğinden eşleşmez.)`)) return;
    setBekliyor(true);
    try {
      await api('firmaKimlikSil', { method: 'POST', body: { firmaId, vkn: k.vkn } });
      setListe((l) => l.filter((x) => x.vkn !== k.vkn));
      if (onDegisti) onDegisti();
    } catch (e) {
      bildir(e.message, true);
    } finally {
      setBekliyor(false);
    }
  }

  return (
    <div className="m2-kimlik">
      <button type="button" className="m2-kimlik-baslik" onClick={() => setAcik((a) => !a)}>
        Fatura kimlikleri (VKN/TCKN) <b>{liste.length}</b>
        <span>{acik ? 'Gizle' : 'Göster'}</span>
      </button>
      {acik && (
        <div className="m2-kimlik-icerik">
          <p className="m2-hint">XML faturadaki VKN/TCKN burada toplanır; bu firmanın sonraki faturaları buradan otomatik eşleşir.</p>
          {liste.length === 0 && <p className="m2-hint">Henüz kayıtlı VKN/TCKN yok.</p>}
          {liste.map((k) => (
            <div key={k.vkn} className="m2-kimlik-satir">
              {duzen && duzen.eski === k.vkn ? (
                <>
                  <input
                    className="m2-input"
                    inputMode="numeric"
                    value={duzen.vkn}
                    onChange={(e) => setDuzen({ ...duzen, vkn: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                  />
                  <button
                    type="button"
                    className="m2-btn mini"
                    disabled={bekliyor || !gecerli(duzen.vkn)}
                    onClick={async () => {
                      if (duzen.vkn === k.vkn || (await kaydet({ vkn: duzen.vkn, unvan: k.unvan, eskiVkn: k.vkn }))) setDuzen(null);
                    }}
                  >
                    Kaydet
                  </button>
                  <button type="button" className="m2-btn sec mini" onClick={() => setDuzen(null)}>
                    Vazgeç
                  </button>
                </>
              ) : (
                <>
                  <div className="m2-kimlik-bilgi">
                    <b>
                      {k.vkn.length === 11 ? 'TCKN' : 'VKN'} {k.vkn}
                    </b>
                    {k.unvan ? <span title={k.unvan}>{k.unvan}</span> : null}
                  </div>
                  <button type="button" className="m2-btn sec mini" disabled={bekliyor} onClick={() => setDuzen({ eski: k.vkn, vkn: k.vkn })}>
                    Düzelt
                  </button>
                  <button type="button" className="m2-btn sec mini" disabled={bekliyor} onClick={() => sil(k)}>
                    Sil
                  </button>
                </>
              )}
            </div>
          ))}
          <div className="m2-kimlik-satir">
            <input
              className="m2-input"
              inputMode="numeric"
              placeholder="+ VKN (10) / TCKN (11) ekle"
              value={yeni}
              onChange={(e) => setYeni(e.target.value.replace(/\D/g, '').slice(0, 11))}
            />
            <button
              type="button"
              className="m2-btn mini"
              disabled={bekliyor || !gecerli(yeni)}
              onClick={async () => {
                if (await kaydet({ vkn: yeni, unvan: '' })) setYeni('');
              }}
            >
              Ekle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EkstreModal({ firma, bildir, onKapat, onKimlikDegisti }) {
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState('');
  const [aralik, setAralik] = useState('tumu'); // tumu | buyil | ozel
  const [bas, setBas] = useState('');
  const [bit, setBit] = useState('');
  const [kapaliGizle, setKapaliGizle] = useState(false);
  const [pdfBekliyor, setPdfBekliyor] = useState(false);
  const bugun = bugunISO();
  const wrapRef = useRef(null);

  useEffect(() => {
    let iptal = false;
    api('ekstre', { query: { firmaId: firma.id } })
      .then((j) => !iptal && setVeri(j))
      .catch((e) => !iptal && setHata(e.message));
    return () => {
      iptal = true;
    };
  }, [firma.id]);

  const baslangic = aralik === 'buyil' ? `${bugun.slice(0, 4)}-01-01` : aralik === 'ozel' ? bas : '';
  const bitis = aralik === 'ozel' ? bit : '';
  const gorunum = useMemo(
    () => (veri ? ekstreGorunum(veri.satirlar, { baslangic, bitis, kapaliGizle }) : null),
    [veri, baslangic, bitis, kapaliGizle],
  );
  const d = gorunum ? durumBul(gorunum.bakiye) : 'yok';
  const kasaBanka = veri?.firma?.bolum === 'kasaBanka';

  // Eskiden yeniye sıralı olduğu için pencere en alta kaydırılmış açılır: son bakiye ve toplam görünür.
  useEffect(() => {
    const el = wrapRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [gorunum]);

  async function pdfPaylas() {
    setPdfBekliyor(true);
    try {
      const aralikMetni = aralik === 'tumu' ? 'Tüm işlemler' : `${tarihTR(baslangic)} - ${tarihTR(bitis || bugun)}`;
      const tanim = ekstrePdfTanimi({ firmaAdi: firma.ad, aralikMetni, gorunum, olusturma: bugunTRMetin() });
      const blob = await ekstrePdfUret(tanim);
      const sonuc = await pdfPaylasVeyaIndir(blob, dosyaAdi(firma.ad, bugun));
      if (sonuc === 'indirildi') bildir('PDF indirildi');
      else if (sonuc === 'paylasildi') bildir('PDF paylaşıldı');
    } catch (e) {
      bildir(e.message || 'PDF oluşturulamadı', true);
    } finally {
      setPdfBekliyor(false);
    }
  }

  return (
    <ModalKabuk baslik={`${firma.ad} — Hesap Özeti`} onKapat={onKapat} genis>
      {hata && <div className="m2-info r">{hata}</div>}
      {!veri && !hata && <div className="m2-empty">Yükleniyor…</div>}
      {gorunum && (
        <>
          {veri.firma?.sigortali !== undefined && (
            <div style={{ marginBottom: 8 }}>
              <span className={`m2-durum ${veri.firma.sigortali ? 'g' : 'r'}`}>{veri.firma.sigortali ? 'Sigortalı' : 'Sigortasız'}</span>
            </div>
          )}
          {veri.kimlikler && (
            <FaturaKimlikleri firmaId={firma.id} ilk={veri.kimlikler} bildir={bildir} onDegisti={onKimlikDegisti} />
          )}

          <div className={`m2-ekstre-ozet ${d}`}>
            <div>
              <div className="m2-hc-durum">{DURUM_ETIKET[d]}</div>
              <div className="m2-hc-tutar">{d === 'yok' ? '—' : TL(Math.abs(gorunum.bakiye))}</div>
            </div>
            <div className="m2-hc-yardim" style={{ maxWidth: 360 }}>
              {kasaBanka
                ? 'Bakiye = Borç − Alacak. Eksi (−): toplamda çıkan para, artı (+): toplamda giren para.'
                : 'Bakiye = Borç − Alacak. Eksi (−) bakiye: firma alacaklı, borcumuz var. Artı (+) bakiye: firma borçlu, bize borçlu.'}
            </div>
          </div>

          <div className="m2-filtre">
            <div className="m2-chips">
              <button type="button" className={`m2-chip ${aralik === 'tumu' ? 'on' : ''}`} onClick={() => setAralik('tumu')}>
                Tüm işlemler
              </button>
              <button type="button" className={`m2-chip ${aralik === 'buyil' ? 'on' : ''}`} onClick={() => setAralik('buyil')}>
                Bu yıl
              </button>
              <button type="button" className={`m2-chip ${aralik === 'ozel' ? 'on' : ''}`} onClick={() => setAralik('ozel')}>
                Özel tarih
              </button>
            </div>
            {aralik === 'ozel' && (
              <div className="m2-row">
                <input className="m2-input" style={{ width: 160 }} type="date" aria-label="Başlangıç" value={bas} onChange={(e) => setBas(e.target.value)} />
                <span>–</span>
                <input className="m2-input" style={{ width: 160 }} type="date" aria-label="Bitiş" value={bit} onChange={(e) => setBit(e.target.value)} />
              </div>
            )}
            <label className="m2-onay">
              <input type="checkbox" checked={kapaliGizle} onChange={(e) => setKapaliGizle(e.target.checked)} /> Peşin ödenen (kendiliğinden kapanan) işlemleri gizle
            </label>
          </div>

          <div className="m2-table-wrap m2-ekstre-wrap" ref={wrapRef}>
            <table className="m2-table m2-ekstre">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Evrak Türü</th>
                  <th>Fatura/Makbuz No</th>
                  <th>Açıklama</th>
                  <th>Ödeme Şekli</th>
                  <th className="sayi">Borç</th>
                  <th className="sayi">Alacak</th>
                  <th className="sayi">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {gorunum.satirlar.length === 0 && !gorunum.devir && (
                  <tr>
                    <td colSpan={8} className="m2-empty">
                      Bu cari için işlem yok.
                    </td>
                  </tr>
                )}
                {gorunum.devir && (
                  <tr className="oto">
                    <td className="nowrap">{tarihTR(gorunum.devir.tarih)}</td>
                    <td>Devir bakiye</td>
                    <td />
                    <td>Önceki işlemlerden devir</td>
                    <td />
                    <td className="sayi" />
                    <td className="sayi" />
                    <td className={`sayi bakiye ${durumBul(gorunum.devir.bakiye)}`}>{paraFmt(gorunum.devir.bakiye)}</td>
                  </tr>
                )}
                {gorunum.satirlar.map((r) => (
                  <tr key={r.id} className={r.otomatik ? 'oto' : ''}>
                    <td className="nowrap">{tarihTR(r.tarih)}</td>
                    <td className="nowrap">{r.evrakTuru}</td>
                    <td>{r.belgeNo}</td>
                    <td>{r.aciklama}</td>
                    <td className="nowrap">{r.odemeSekli}</td>
                    <td className="sayi">{r.borc ? paraFmt(r.borc) : ''}</td>
                    <td className="sayi">{r.alacak ? paraFmt(r.alacak) : ''}</td>
                    <td className={`sayi bakiye ${durumBul(r.bakiye)}`}>{paraFmt(r.bakiye)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>Toplam</td>
                  <td className="sayi">{paraFmt(gorunum.toplamBorc)}</td>
                  <td className="sayi">{paraFmt(gorunum.toplamAlacak)}</td>
                  <td className={`sayi bakiye ${d}`}>{paraFmt(gorunum.bakiye)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="m2-modal-actions">
            <button className="m2-btn sec" onClick={onKapat}>
              Kapat
            </button>
            <button className="m2-btn" disabled={pdfBekliyor} onClick={pdfPaylas}>
              <Share2 size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} />
              {pdfBekliyor ? 'Hazırlanıyor…' : 'Paylaş (PDF)'}
            </button>
          </div>
          <p className="m2-hint">İşlemler eskiden yeniye sıralıdır, PDF ile aynı: ilk işlem en üstte, son bakiye en altta.</p>
        </>
      )}
    </ModalKabuk>
  );
}

// Düzenleme Modunda hücre: tıklayınca düzenlenir, Enter/başka yere tıklama kaydeder, Esc vazgeçer.
function DuzenlenebilirHucre({ aktif, tur = 'text', secenekler, deger, metin, onKaydet }) {
  const [acik, setAcik] = useState(false);
  const [v, setV] = useState(deger || '');
  if (!aktif) return metin;
  if (!acik) {
    return (
      <span
        className="m2-hucre-duzenle"
        role="button"
        tabIndex={0}
        onClick={() => {
          setV(deger || '');
          setAcik(true);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (setV(deger || ''), setAcik(true))}
      >
        {metin || '—'}
      </span>
    );
  }
  if (tur === 'select') {
    return (
      <select
        autoFocus
        className="m2-select m2-hucre-input"
        value={v}
        onChange={(e) => {
          setAcik(false);
          if (e.target.value !== deger) onKaydet(e.target.value);
        }}
        onBlur={() => setAcik(false)}
      >
        {!secenekler.includes(deger) && <option value={deger || ''}>{deger || '—'}</option>}
        {secenekler.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    );
  }
  const bitir = (kaydet) => {
    setAcik(false);
    if (kaydet && v !== (deger || '')) onKaydet(v);
  };
  return (
    <input
      autoFocus
      className="m2-input m2-hucre-input"
      type={tur}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => bitir(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') bitir(true);
        if (e.key === 'Escape') bitir(false);
      }}
    />
  );
}

// Datalar'daki bir kaydı (fatura/fiş veya makbuz grubu) aynı form alanlarıyla düzenler.
// Kaydedince grubun TÜM satırları (otomatik makbuzlar dahil) tek işlemde yeniden yazılır.
// Kaynaklı (avans, izin, tahakkuk, yemek kartı, devir, günsonu, hızlı gider) satırlar için tek pencerede düzenleme.
// Kapalı alanlar kaynağı başka yerden yönetildiği için değişmez; değişen alanlar sırayla uygulanır.
function KaynakDuzenleModal({ satir, kategoriler, kategoriAktif, kdvAktif, tarihAktif, aciklamaAktif, tutarAktif, kasaAktif, tutarDeger, onKaydet, onKapat }) {
  const [tarih, setTarih] = useState(satir.tarih || '');
  const [aciklama, setAciklama] = useState(satir.aciklama || '');
  const [kategori, setKategori] = useState(satir.giderKategorisi || '');
  const [tutar, setTutar] = useState(String(tutarDeger));
  const [kdv, setKdv] = useState(satir.kdv == null ? '' : String(Math.abs(satir.kdv)));
  const [kasa, setKasa] = useState(satir.kasaGrubu || '');
  const [bekliyor, setBekliyor] = useState(false);
  const kapaliNeden = {
    izin: "İzin tarihi/açıklaması Personel Klasörü'ndeki izin girişinden değişir.",
    gunsonu: 'Günsonu kaydında yalnızca tutar değişir (diğerleri Günsonları sekmesinden).',
    avans: 'Avans kaydında kategori ve KDV yoktur.',
    yemek_karti: 'Yemek kartı kayıtlarında kasa seçimi yoktur.',
    tahakkuk: 'Tahakkuk fişinde kasa seçimi yoktur.',
    devir: 'Devir kaydında kasa seçimi yoktur.',
  }[satir.kaynak];
  async function kaydet() {
    const d = [];
    if (tutarAktif && tutar !== String(tutarDeger)) d.push({ alan: 'tutar', deger: tutar, etiket: 'tutar değişikliği' });
    if (kdvAktif && kdv !== (satir.kdv == null ? '' : String(Math.abs(satir.kdv)))) d.push({ alan: 'kdv', deger: kdv, etiket: 'KDV değişikliği' });
    if (tarihAktif && tarih !== (satir.tarih || '')) d.push({ alan: 'tarih', deger: tarih, etiket: 'tarih değişikliği' });
    if (aciklamaAktif && aciklama !== (satir.aciklama || '')) d.push({ alan: 'aciklama', deger: aciklama, etiket: 'açıklama değişikliği' });
    if (kategoriAktif && kategori !== (satir.giderKategorisi || '')) d.push({ alan: 'giderKategorisi', deger: kategori, etiket: 'kategori değişikliği' });
    if (kasaAktif && kasa !== (satir.kasaGrubu || '')) d.push({ alan: 'kasaGrubu', deger: kasa, etiket: 'kasa değişikliği' });
    if (!d.length) return onKapat();
    setBekliyor(true);
    const ok = await onKaydet(d);
    setBekliyor(false);
    if (ok) onKapat();
  }
  return (
    <ModalKabuk baslik={`${satir.firmaAdi} — ${satir.evrakTuru}`} onKapat={onKapat}>
      <label className="m2-label">Tarih</label>
      <input className="m2-input" type="date" value={tarih} disabled={!tarihAktif} onChange={(e) => setTarih(e.target.value)} />
      <label className="m2-label">Açıklama</label>
      <input className="m2-input" value={aciklama} disabled={!aciklamaAktif} onChange={(e) => setAciklama(e.target.value)} />
      {(kategoriAktif || satir.giderKategorisi) && (
        <>
          <label className="m2-label">Gider Kategorisi</label>
          <select className="m2-select" value={kategori} disabled={!kategoriAktif} onChange={(e) => setKategori(e.target.value)}>
            {!kategoriler.includes(kategori) && <option value={kategori}>{kategori || '—'}</option>}
            {kategoriler.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </>
      )}
      <label className="m2-label">Tutar</label>
      <input className="m2-input" value={tutar} disabled={!tutarAktif} onChange={(e) => setTutar(e.target.value)} />
      {satir.kdv != null && (
        <>
          <label className="m2-label">KDV</label>
          <input className="m2-input" value={kdv} disabled={!kdvAktif} onChange={(e) => setKdv(e.target.value)} />
        </>
      )}
      {(kasaAktif || satir.kasaGrubu) && (
        <>
          <label className="m2-label">Kasa</label>
          <select className="m2-select" value={kasa} disabled={!kasaAktif} onChange={(e) => setKasa(e.target.value)}>
            <option value="gunluk">Günlük kasa</option>
            <option value="ana">Ana kasa</option>
          </select>
        </>
      )}
      {kapaliNeden && <div className="m2-info">{kapaliNeden}</div>}
      <div className="m2-info">Kaydedince bağlı kaynak kaydı da güncellenir ve satıra "✎ elle" işareti düşer.</div>
      <ModalAksiyon onKapat={onKapat} onKaydet={kaydet} bekliyor={bekliyor} />
    </ModalKabuk>
  );
}

function KayitDuzenleModal({ grupId, veri, bildir, onKaydet, onKapat }) {
  const [grup, setGrup] = useState(null);
  const [hata, setHata] = useState('');
  useEffect(() => {
    api('kayitGrubu', { query: { grupId } })
      .then(setGrup)
      .catch((e) => setHata(e.message));
  }, [grupId]);
  if (!grup) {
    return (
      <ModalKabuk baslik="Kaydı Düzenle" onKapat={onKapat}>
        {hata ? <div className="m2-info r">{hata}</div> : <div className="m2-empty">Yükleniyor…</div>}
      </ModalKabuk>
    );
  }
  return grup.faturalar.length ? (
    <FaturaDuzenleForm grup={grup} veri={veri} bildir={bildir} onKaydet={onKaydet} onKapat={onKapat} />
  ) : (
    <MakbuzDuzenleForm grup={grup} veri={veri} bildir={bildir} onKaydet={onKaydet} onKapat={onKapat} />
  );
}

function FaturaDuzenleForm({ grup, veri, bildir, onKaydet, onKapat }) {
  const f = grup.faturalar[0];
  const [tarih, setTarih] = useState(f.tarih);
  const [firmaId, setFirmaId] = useState(f.firma_id);
  const [faturaNo, setFaturaNo] = useState(f.fatura_no || '');
  const [aciklama, setAciklama] = useState(f.aciklama || '');
  const [kategori, setKategori] = useState(f.gider_kategorisi || '');
  const [tutar, setTutar] = useState(String(f.fatura_tutari));
  const [kdv, setKdv] = useState(f.kdv === null || f.kdv === undefined ? '' : String(f.kdv));
  const [tur, setTur] = useState(f.odeme_turu);
  const [detay, setDetay] = useState(f.kasa || f.odeme_hesabi || '');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onKapat);
  const t = sayi(tutar);

  function kaydet() {
    if (!firmaId) return bildir('Firma seçin', true);
    if (!(t > 0)) return bildir('Tutarı girin', true);
    if (!kategori) return bildir('Gider kategorisini seçin', true);
    const y = yontemPayload(tur, detay);
    if (y.hata) return bildir(y.hata, true);
    calistir({ grupId: grup.faturalar[0].grup_id, tarih, firmaId, faturaNo, aciklama, giderKategorisi: kategori, faturaTutari: tutar, kdv, iade: !!f.iade, ...y });
  }
  return (
    <ModalKabuk baslik={f.iade ? 'İade Faturası Düzenle' : 'Fatura / Fiş Düzenle'} onKapat={onKapat}>
      <label className="m2-label">Tarih</label>
      <input className="m2-input" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />
      <label className="m2-label">Firma *</label>
      <FirmaSecici firmalar={veri.firmalar} valueId={firmaId} onChange={(id) => setFirmaId(id)} onYeni={() => bildir('Yeni firmayı Fişler/Faturalar sekmesinden ekleyin', true)} />
      <label className="m2-label">Fatura No</label>
      <input className="m2-input" value={faturaNo} onChange={(e) => setFaturaNo(e.target.value)} />
      <label className="m2-label">Açıklama</label>
      <input className="m2-input" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
      <label className="m2-label">Gider Kategorisi</label>
      <select className="m2-select" value={kategori} onChange={(e) => setKategori(e.target.value)}>
        <option value="">— Seçin —</option>
        {veri.kategoriler.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <label className="m2-label">Ödeme Türü</label>
      <OdemeSecimi
        turler={FATURA_ODEME_TURLERI}
        tur={tur}
        detay={detay}
        onChange={(a, b) => {
          setTur(a);
          setDetay(b);
        }}
        yontemler={veri.odemeYontemleri}
        onYeni={() => bildir('Yeni ödeme yöntemini Fişler/Faturalar sekmesinden ekleyin', true)}
        cariNotu="Cari olarak kaydedilir; firmanın borcuna eklenir."
      />
      <label className="m2-label">{f.iade ? 'İade Tutarı (KDV dahil) *' : 'Fatura Tutarı (KDV dahil) *'}</label>
      <input className="m2-input" type="number" step="any" min="0" value={tutar} onChange={(e) => setTutar(e.target.value)} />
      <label className="m2-label">KDV Tutarı</label>
      <input className="m2-input" type="number" step="any" min="0" placeholder="Opsiyonel" value={kdv} onChange={(e) => setKdv(e.target.value)} />
      <p className="m2-hint">Kaydedince bu kaydın otomatik ödeme ve tahsilat makbuzları da yeni bilgilere göre yeniden yazılır.</p>
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon onKapat={onKapat} bekliyor={bekliyor} onKaydet={kaydet} />
    </ModalKabuk>
  );
}

function MakbuzDuzenleForm({ grup, veri, bildir, onKaydet, onKapat }) {
  const m = grup.makbuzlar.find((x) => !x.otomatik) || grup.makbuzlar[0];
  const [tarih, setTarih] = useState(m.tarih);
  const [firmaId, setFirmaId] = useState(m.firma_id);
  const [makbuzTuru, setMakbuzTuru] = useState(m.makbuz_turu);
  const [faturaNo, setFaturaNo] = useState(m.fatura_no || '');
  const [aciklama, setAciklama] = useState(m.aciklama || '');
  const [tutar, setTutar] = useState(String(m.tutar));
  const [tur, setTur] = useState(m.odeme_turu || '');
  const [detay, setDetay] = useState(m.kasa || m.odeme_hesabi || '');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onKapat);
  const t = sayi(tutar);

  function kaydet() {
    if (!firmaId) return bildir('Firma seçin', true);
    if (!(t > 0)) return bildir('Tutarı girin', true);
    const y = yontemPayload(tur, detay);
    if (y.hata) return bildir(y.hata, true);
    calistir({ grupId: m.grup_id, tarih, firmaId, makbuzTuru, faturaNo, aciklama, tutar, ...y });
  }
  return (
    <ModalKabuk baslik="Makbuz Düzenle" onKapat={onKapat}>
      <label className="m2-label">Makbuz Türü</label>
      <div className="m2-chips">
        {['Tahsilat', 'Ödeme'].map((k) => (
          <button key={k} type="button" className={`m2-chip ${makbuzTuru === k ? 'on' : ''}`} onClick={() => setMakbuzTuru(k)}>
            {k} Makbuzu
          </button>
        ))}
      </div>
      <label className="m2-label">Tarih</label>
      <input className="m2-input" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />
      <label className="m2-label">Firma *</label>
      <FirmaSecici firmalar={veri.firmalar} valueId={firmaId} onChange={(id) => setFirmaId(id)} onYeni={() => bildir('Yeni firmayı Fişler/Faturalar sekmesinden ekleyin', true)} />
      <label className="m2-label">Fatura / Makbuz No</label>
      <input className="m2-input" value={faturaNo} onChange={(e) => setFaturaNo(e.target.value)} />
      <label className="m2-label">Açıklama</label>
      <input className="m2-input" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
      <label className="m2-label">Ödeme Türü</label>
      <OdemeSecimi
        turler={MAKBUZ_ODEME_TURLERI}
        tur={tur}
        detay={detay}
        onChange={(a, b) => {
          setTur(a);
          setDetay(b);
        }}
        yontemler={veri.odemeYontemleri}
        onYeni={() => bildir('Yeni ödeme yöntemini Fişler/Faturalar sekmesinden ekleyin', true)}
      />
      <label className="m2-label">Tutar *</label>
      <input className="m2-input" type="number" step="any" min="0" value={tutar} onChange={(e) => setTutar(e.target.value)} />
      <p className="m2-hint">Kaydedince ödeme şekli carisindeki karşı makbuz da yeniden yazılır.</p>
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon onKapat={onKapat} bekliyor={bekliyor} onKaydet={kaydet} />
    </ModalKabuk>
  );
}

// ---------------------------------------------------------------------------
// Modallar: yeni firma / kategori / ödeme yöntemi
// ---------------------------------------------------------------------------
function FirmaModal({ baslangicAd, baslangicVkn, baslangicUnvan, kategoriler, onKaydet, onBitti, onKapat }) {
  const [ad, setAd] = useState(baslangicAd || '');
  const [vkn, setVkn] = useState(baslangicVkn || '');
  const [varsayilanKategori, setVarsayilanKategori] = useState('');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);

  return (
    <ModalKabuk baslik="Yeni Firma Ekle" onKapat={onKapat}>
      <label className="m2-label">Firma Adı</label>
      <input className="m2-input" autoFocus placeholder="Firma adı" value={ad} onChange={(e) => setAd(e.target.value)} />
      <label className="m2-label">Gider Kategorisi</label>
      <select className="m2-select" value={varsayilanKategori} onChange={(e) => setVarsayilanKategori(e.target.value)}>
        <option value="">— Seçin —</option>
        {kategoriler.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <label className="m2-label">VKN / TCKN (opsiyonel)</label>
      <input
        className="m2-input"
        inputMode="numeric"
        placeholder="10 haneli VKN ya da 11 haneli TCKN"
        value={vkn}
        onChange={(e) => setVkn(e.target.value.replace(/\D/g, '').slice(0, 11))}
      />
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon
        onKapat={onKapat}
        devreDisi={!ad.trim() || (vkn !== '' && vkn.length !== 10 && vkn.length !== 11)}
        bekliyor={bekliyor}
        onKaydet={() => calistir({ ad, varsayilanKategori, ...(vkn ? { vkn, unvan: baslangicUnvan || '' } : {}) })}
      />
    </ModalKabuk>
  );
}

function KategoriModal({ onKaydet, onBitti, onKapat }) {
  const [ad, setAd] = useState('');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);
  return (
    <ModalKabuk baslik="Yeni Gider Kategorisi" onKapat={onKapat}>
      <label className="m2-label">Kategori Adı</label>
      <input className="m2-input" autoFocus value={ad} onChange={(e) => setAd(e.target.value)} />
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon onKapat={onKapat} devreDisi={!ad.trim()} bekliyor={bekliyor} onKaydet={() => calistir({ ad })} />
    </ModalKabuk>
  );
}

function YontemModal({ varsayilanTur, onKaydet, onBitti, onKapat }) {
  const [odemeTuru, setOdemeTuru] = useState(varsayilanTur || 'Kredi Kartı');
  const [ad, setAd] = useState('');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);
  return (
    <ModalKabuk baslik="Yeni Ödeme Yöntemi" onKapat={onKapat}>
      <label className="m2-label">Tür</label>
      <select className="m2-select" value={odemeTuru} onChange={(e) => setOdemeTuru(e.target.value)}>
        <option value="Nakit">Nakit (kasa)</option>
        <option value="Kredi Kartı">Kredi Kartı</option>
        <option value="Banka Havalesi">Banka Havalesi</option>
        <option value="Ortaklar">Ortaklar</option>
      </select>
      <label className="m2-label">Ad</label>
      <input
        className="m2-input"
        autoFocus
        placeholder={odemeTuru === 'Nakit' ? 'Örn. Ofis Kasası' : odemeTuru === 'Kredi Kartı' ? 'Örn. Garanti Kredi Kartı' : odemeTuru === 'Ortaklar' ? 'Örn. Ahmet Cepten' : 'Örn. Garanti Bankası'}
        value={ad}
        onChange={(e) => setAd(e.target.value)}
      />
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon
        onKapat={onKapat}
        devreDisi={!ad.trim()}
        bekliyor={bekliyor}
        onKaydet={() => calistir({ odemeTuru, ad })}
      />
    </ModalKabuk>
  );
}