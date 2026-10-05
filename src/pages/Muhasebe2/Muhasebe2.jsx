import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Filter, Pencil, Plus, Share2 } from 'lucide-react';
import { dosyaAdi, durumBul, ekstreGorunum, ekstrePdfTanimi, ekstrePdfUret, paraFmt, pdfPaylasVeyaIndir } from './ekstrePdf';
import { ModalAksiyon, ModalKabuk, TL, api, bugunISO, sayi, sayiFmt, tarihTR, trNorm, useModalKaydet } from './m2Ortak';
import YemekKartlariSekmesi from './YemekKartlari';
import TahakkuklarSekmesi from './Tahakkuklar';
import GunsonlariSekmesi from './Gunsonlari';
import { FILTRE_KOLONLARI, FiltreMenu, bosSecimler, filtreUygula, varsayilanTarihSecimi } from './DatalarFiltre';
import './Muhasebe2.css';

// ---------------------------------------------------------------------------
// Muhasebe2 — Sekmeler: "Fişler/Faturalar ve Makbuzlar" (giriş), "Datalar" (Excel düzeninde döküm,
// Excel tarzı filtreler, Düzenleme Modu), "Hesap Özetleri" (cari kartları, düzenleme, ekstre ve PDF),
// "Yemek Kartları" ve "Tahakkuklar" (personel maaşı + sabit giderler).
// Giriş: sol Fiş/Fatura formu, sağ Tahsilat / Ödeme makbuzu (kaydırmalı anahtar).
// Cari dışı yöntemle girilen her fatura için ödeme şekli carisine otomatik makbuz yazılır (sunucu yapar).
// ---------------------------------------------------------------------------

const FATURA_ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi', 'Cari'];
const MAKBUZ_ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi'];
const MAKS_GECMIS = 3;
const KAYNAK_ETIKET = { yemek_karti: 'Yemek Kartları', tahakkuk: 'Tahakkuklar', avans: 'Personel Klasörü' };

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
  const [veri, setVeri] = useState({ firmalar: [], kategoriler: [], odemeYontemleri: [], bugun: '' });
  const [hata, setHata] = useState('');
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // {tur, ad, odemeTuru, bitince}
  const [sekme, setSekme] = useState('giris'); // 'giris' | 'datalar'
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

  // ---- Düzenleme Modu ve geri/ileri alma (Ctrl+Z / Ctrl+Shift+Z, son 3 işlem; yalnızca bu oturumda) ----
  const [duzenlemeModu, setDuzenlemeModu] = useState(false);
  const [gecmis, setGecmis] = useState({ liste: [], index: -1 });
  const [yenileSayac, setYenileSayac] = useState(0);
  const gecmisRef = useRef(gecmis);
  gecmisRef.current = gecmis;
  const islemKilidi = useRef(false);

  // Her işlem sunucudan {grupId, oncesi, sonrasi} anlık görüntüsüyle döner; geri alma bunları kullanır.
  const gecmiseEkle = useCallback((sonuc, etiket) => {
    setGecmis((g) => {
      const liste = [...g.liste.slice(0, g.index + 1), { grupId: sonuc.grupId, oncesi: sonuc.oncesi, sonrasi: sonuc.sonrasi, etiket }].slice(-MAKS_GECMIS);
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
        await api('kayitGeriYaz', {
          method: 'POST',
          body: {
            grupId: hedef.grupId,
            beklenen: yon === 'geri' ? hedef.sonrasi : hedef.oncesi,
            yazilacak: yon === 'geri' ? hedef.oncesi : hedef.sonrasi,
          },
        });
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
    bildir(
      payload.odemeTuru === 'Cari'
        ? 'Fatura kaydedildi (cariye yazıldı)'
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
    await yukle();
    return j.firma;
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
          <FisFaturaFormu veri={veri} bildir={bildir} onKaydet={fisFaturaKaydet} onModal={setModal} />
        </div>
        <div className="m2-card">
          <MakbuzFormu veri={veri} bildir={bildir} onKaydet={makbuzKaydet} onModal={setModal} />
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
  return { odemeTuru: tur, odemeHesabi: '', kasa: '' }; // Cari
}

// ---------------------------------------------------------------------------
// Fiş / Fatura girişi
// ---------------------------------------------------------------------------
function FisFaturaFormu({ veri, bildir, onKaydet, onModal }) {
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
      await onKaydet({ tarih, firmaId, faturaNo, aciklama, giderKategorisi: kategori, faturaTutari: tutar, kdv, ...y });
      setFirmaId('');
      setFaturaNo('');
      setAciklama('');
      setKategori('');
      setTutar('');
      setKdv('');
      setTur('');
      setDetay('');
      setFormKey((k) => k + 1);
    } catch (e) {
      bildir(e.message, true);
    } finally {
      setKaydediyor(false);
    }
  }

  return (
    <>
      <h2>Fatura / Fiş Girişi</h2>

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
        onYeni={(ad) => onModal({ tur: 'firma', ad, bitince: (f) => firmaSec(f.id, f) })}
      />
      {firma && <div className={`m2-info ${bakiyeEtiketi(firma.bakiye).ton}`}>Şu an: {bakiyeEtiketi(firma.bakiye).metin}</div>}

      <label className="m2-label">Fatura No</label>
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
        onYeni={(odemeTuru) => onModal({ tur: 'yontem', odemeTuru, bitince: (y) => { setTur(y.odeme_turu); setDetay(y.ad); } })}
        cariNotu="Cari olarak kaydedilir; firmanın borcuna eklenir."
      />

      <label className="m2-label">
        Fatura Tutarı (KDV dahil) <b>*</b>
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
        <div className={`m2-info ${bakiyeEtiketi(firma.bakiye + t).ton}`}>
          Bu kayıttan sonra: {bakiyeEtiketi(firma.bakiye + t).metin}
        </div>
      )}
      {firma && t > 0 && tur && tur !== 'Cari' && detay && (
        <div className="m2-info">
          Otomatik oluşur: {firma.ad} için Ödeme Makbuzu ve {detay} için Tahsilat Makbuzu. {firma.ad} bakiyesi değişmez.
        </div>
      )}

      <button className="m2-btn full" disabled={kaydediyor} onClick={kaydet}>
        {kaydediyor ? 'Kaydediliyor…' : 'Kaydet'}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Makbuz: Tahsilat / Ödeme
// ---------------------------------------------------------------------------
const MAKBUZ_ACIKLAMA = {
  Tahsilat: 'Borcu olan cariden aldığınız ödeme. Tutar carinin borcundan düşer.',
  Ödeme: 'Borcunuz olan cariye yaptığınız ödeme. Tutar sizin borcunuzdan düşer.',
};

function MakbuzFormu({ veri, bildir, onKaydet, onModal }) {
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
      await onKaydet({ makbuzTuru, tarih, firmaId, faturaNo, aciklama, tutar, ...y });
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
  'Tahsilat Makbuzu': 'tahsilat',
  'Ödeme (Tediye) Makbuzu': 'tediye',
};

function DatalarSekmesi({ aktif, duzenlemeModu, veri, bildir, yenile, onIslem, onDegisti }) {
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
  const alanDegistir = (r, alan, deger, etiket) => islemYap({ grupId: r.grupId, satirId: r.id, alan, deger }, 'kayitAlan', etiket);
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
              {duzenlemeModu && <th>İşlem</th>}
            </tr>
          </thead>
          <tbody>
            {kayitlar && kayitlar.length === 0 && (
              <tr>
                <td colSpan={DATALAR_SUTUNLAR.length + (duzenlemeModu ? 1 : 0)} className="m2-empty">
                  Henüz kayıt yok.
                </td>
              </tr>
            )}
            {kayitlar && kayitlar.length > 0 && gorunen.length === 0 && (
              <tr>
                <td colSpan={DATALAR_SUTUNLAR.length + (duzenlemeModu ? 1 : 0)} className="m2-empty">
                  Seçili filtrelere uyan kayıt yok. Tarih filtresinden başka bir ay seçebilir veya "Filtreleri temizle"ye basabilirsiniz.
                </td>
              </tr>
            )}
            {gorunen.map((r) => (
              <tr key={r.id} className={r.otomatik ? 'oto' : ''}>
                <td className="nowrap">
                  <DuzenlenebilirHucre aktif={duzenlemeModu && !r.kaynak} tur="date" deger={r.tarih} metin={tarihTR(r.tarih)} onKaydet={(v) => alanDegistir(r, 'tarih', v, 'tarih değişikliği')} />
                </td>
                <td className="nowrap">
                  <span className={`m2-badge ${EVRAK_SINIFI[r.evrakTuru] || ''}`}>{r.evrakTuru}</span>
                </td>
                <td>{r.firmaAdi}</td>
                <td>
                  <DuzenlenebilirHucre aktif={duzenlemeModu && !r.kaynak} deger={r.faturaNo} metin={r.faturaNo} onKaydet={(v) => alanDegistir(r, 'faturaNo', v, 'fatura no değişikliği')} />
                </td>
                <td>
                  <DuzenlenebilirHucre aktif={duzenlemeModu && !r.kaynak && !r.otomatik} deger={r.aciklama} metin={r.aciklama} onKaydet={(v) => alanDegistir(r, 'aciklama', v, 'açıklama değişikliği')} />
                </td>
                <td>
                  <DuzenlenebilirHucre
                    aktif={duzenlemeModu && !r.kaynak && r.evrakTuru === 'Fatura/Fiş'}
                    tur="select"
                    secenekler={kategoriler}
                    deger={r.giderKategorisi}
                    metin={r.giderKategorisi}
                    onKaydet={(v) => alanDegistir(r, 'giderKategorisi', v, 'kategori değişikliği')}
                  />
                </td>
                <td className="nowrap">{r.odemeTuru}</td>
                <td className="nowrap">{r.odemeSekli}</td>
                <td className="sayi">{para(r.tutar)}</td>
                <td className="sayi">{para(r.kdv)}</td>
                <td className="sayi">{para(r.tahsilat)}</td>
                <td className="sayi">{para(r.odemeTediye)}</td>
                {duzenlemeModu && (
                  <td>
                    {r.kaynak ? (
                      <span className="m2-kilit" title={`Bu kayıt ${KAYNAK_ETIKET[r.kaynak] || 'başka bir sekmeden'} yönetilir`}>
                        🔒 {KAYNAK_ETIKET[r.kaynak] || r.kaynak}
                      </span>
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

function HesapOzetleriSekmesi({ aktif, bildir, onDegisti }) {
  const [firmalar, setFirmalar] = useState(null);
  const [kategoriler, setKategoriler] = useState([]);
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [ara, setAra] = useState('');
  const [durum, setDurum] = useState('tumu'); // tumu | alacakli | borclu | yok
  const [bolum, setBolum] = useState('tumu'); // tumu | cariler | kasaBanka
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
    if (bolum !== 'tumu') l = l.filter((f) => f.bolum === bolum);
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
        <div className="m2-chips tight">
          {chip('tumu', bolum, setBolum, 'Tüm gruplar')}
          {chip('cariler', bolum, setBolum, 'Cariler')}
          {chip('kasaBanka', bolum, setBolum, 'Kasa ve Banka')}
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

      {ekstreFirma && <EkstreModal firma={ekstreFirma} bildir={bildir} onKapat={() => setEkstreFirma(null)} />}
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
function EkstreModal({ firma, bildir, onKapat }) {
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
    calistir({ grupId: grup.faturalar[0].grup_id, tarih, firmaId, faturaNo, aciklama, giderKategorisi: kategori, faturaTutari: tutar, kdv, ...y });
  }
  return (
    <ModalKabuk baslik="Fatura / Fiş Düzenle" onKapat={onKapat}>
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
      <label className="m2-label">Fatura Tutarı (KDV dahil) *</label>
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
function FirmaModal({ baslangicAd, kategoriler, onKaydet, onBitti, onKapat }) {
  const [ad, setAd] = useState(baslangicAd || '');
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
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon
        onKapat={onKapat}
        devreDisi={!ad.trim()}
        bekliyor={bekliyor}
        onKaydet={() => calistir({ ad, varsayilanKategori })}
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
      </select>
      <label className="m2-label">Ad</label>
      <input
        className="m2-input"
        autoFocus
        placeholder={odemeTuru === 'Nakit' ? 'Örn. Ofis Kasası' : odemeTuru === 'Kredi Kartı' ? 'Örn. Garanti Kredi Kartı' : 'Örn. Garanti Bankası'}
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