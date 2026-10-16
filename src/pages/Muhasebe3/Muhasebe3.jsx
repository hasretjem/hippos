import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Filter, Pencil, Plus, Share2 } from 'lucide-react';
import { dosyaAdi, durumBul, ekstreGorunum, ekstrePdfTanimi, ekstrePdfUret, paraFmt, pdfPaylasVeyaIndir } from '../Muhasebe2/ekstrePdf';
import { ModalAksiyon, ModalKabuk, TL, bugunISO, sayi, sayiFmt, tarihTR, trNorm, useModalKaydet } from '../Muhasebe2/m2Ortak';
import { FiltreMenu, filtreUygula, varsayilanTarihSecimi } from '../Muhasebe2/DatalarFiltre';
import '../Muhasebe2/Muhasebe2.css';
import './Muhasebe3.css';

// Muhasebe3: BAĞIMSIZ deneme (sandbox) muhasebesi — Hippos verisine bağlı değil, yalnızca m3_* tablolarını kullanır.

const MAKS_GECMIS = 3;
const EVRAK_SINIFI = {
  'Alış Fişi/Faturası': 'fatura',
  'Satış/İade Faturası': 'iade',
  'Tahsilat Makbuzu': 'tahsilat',
  'Ödeme Makbuzu': 'tediye',
};
const ODEME_TURU_HESAP = { Nakit: 'kasa', 'Kredi Kartı': 'kart', 'Banka Havalesi': 'banka', Ortaklar: 'ortak' };
const EVRAK_ODEME_TURLERI = ['Cari', 'Nakit', 'Kredi Kartı', 'Banka Havalesi', 'Ortaklar'];
const MAKBUZ_ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi', 'Ortaklar'];
const TUR_ETIKET = { firma: 'Firma', gider: 'Gider Hesabı', gelir: 'Gelir Hesabı', kasa: 'Kasa', banka: 'Banka', kart: 'Kredi Kartı', ortak: 'Ortak' };
const ALT_ETIKET = { kasa: 'Yeni Kasa', kart: 'Yeni Kart', banka: 'Yeni Banka', ortak: 'Yeni Ortak' };

async function api(resource, { method = 'GET', body, query } = {}) {
  const qs = new URLSearchParams({ resource, ...(query || {}) }).toString();
  const res = await fetch(`/api/muhasebe3?${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try {
    j = await res.json();
  } catch {
    j = {};
  }
  if (!res.ok) throw new Error(j.error || `Sunucu hatası (${res.status})`);
  return j;
}

function bakiyeEtiketi(b) {
  const d = durumBul(b);
  if (d === 'alacakli') return { ton: 'r', metin: `Alacaklı: ${TL(Math.abs(b))} (borcumuz var)` };
  if (d === 'borclu') return { ton: 'g', metin: `Borçlu: ${TL(Math.abs(b))} (bize borçlu)` };
  return { ton: '', metin: 'Bakiye yok' };
}
function hesapBakiyeMetni(h) {
  const d = durumBul(h.bakiye);
  if (d === 'yok') return { tutar: '—', durum: 'Bakiye yok' };
  if (h.tur === 'firma' || h.tur === 'ortak') return { tutar: TL(Math.abs(h.bakiye)), durum: d === 'alacakli' ? 'Alacaklı' : 'Borçlu' };
  return { tutar: TL(Math.abs(h.bakiye)), durum: d === 'alacakli' ? 'Alacak bakiyesi' : 'Borç bakiyesi' };
}

function grupSiniflari(liste) {
  let alt = false;
  return liste.map((r, i) => {
    const onceki = i > 0 && liste[i - 1].grupId && liste[i - 1].grupId === r.grupId;
    const sonraki = i < liste.length - 1 && liste[i + 1].grupId && liste[i + 1].grupId === r.grupId;
    if (!onceki) alt = !alt;
    const konum = onceki && sonraki ? 'g-orta' : onceki ? 'g-son' : sonraki ? 'g-ilk' : 'g-tek';
    return `${konum}${konum === 'g-tek' ? '' : ' g-coklu'}${alt ? ' g-alt' : ''}`;
  });
}

export default function Muhasebe3({ onNavigate }) {
  const [veri, setVeri] = useState({ hesaplar: [], bugun: '', mizan: null });
  const [hata, setHata] = useState('');
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null);
  const [sekme, setSekme] = useState('giris');
  const [datalarHedef, setDatalarHedef] = useState(null);
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

  // ---- Düzenleme Modu ve geri/ileri alma (grup anlık görüntüsüyle, son 3 işlem, yalnızca bu oturumda) ----
  const [duzenlemeModu, setDuzenlemeModu] = useState(false);
  const [gecmis, setGecmis] = useState({ liste: [], index: -1 });
  const [yenileSayac, setYenileSayac] = useState(0);
  const gecmisRef = useRef(gecmis);
  gecmisRef.current = gecmis;
  const kilit = useRef(false);

  const gecmiseEkle = useCallback((sonuc, etiket) => {
    if (!sonuc || !sonuc.grupId || !Array.isArray(sonuc.sonrasi)) return;
    const kayit = { grupId: sonuc.grupId, oncesi: sonuc.oncesi || [], sonrasi: sonuc.sonrasi, etiket };
    setGecmis((g) => {
      const liste = [...g.liste.slice(0, g.index + 1), kayit].slice(-MAKS_GECMIS);
      return { liste, index: liste.length - 1 };
    });
  }, []);

  const geriIleri = useCallback(
    async (yon) => {
      if (kilit.current) return;
      const { liste, index } = gecmisRef.current;
      const hedef = yon === 'geri' ? liste[index] : liste[index + 1];
      if (!hedef) return;
      kilit.current = true;
      try {
        await api('kayitGeriYaz', { method: 'POST', body: { grupId: hedef.grupId, yazilacak: yon === 'geri' ? hedef.oncesi : hedef.sonrasi } });
        setGecmis((g) => ({ ...g, index: g.index + (yon === 'geri' ? -1 : 1) }));
        bildir(`${yon === 'geri' ? 'Geri alındı' : 'İleri alındı'}: ${hedef.etiket}`);
        setYenileSayac((n) => n + 1);
        await yukle();
      } catch (e) {
        bildir(e.message, true);
      } finally {
        kilit.current = false;
      }
    },
    [bildir, yukle],
  );

  useEffect(() => {
    if (!duzenlemeModu) return undefined;
    function tusa(e) {
      const hedef = e.target;
      const etiket = String(hedef?.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(etiket) || hedef?.isContentEditable) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = String(e.key).toLowerCase();
      if (k === 'z') {
        e.preventDefault();
        geriIleri(e.shiftKey ? 'ileri' : 'geri');
      } else if (k === 'y') {
        e.preventDefault();
        geriIleri('ileri');
      }
    }
    window.addEventListener('keydown', tusa);
    return () => window.removeEventListener('keydown', tusa);
  }, [duzenlemeModu, geriIleri]);

  async function evrakKaydet(payload) {
    const j = await api('evrakKaydet', { method: 'POST', body: payload });
    gecmiseEkle(j, 'evrak girişi');
    bildir(
      payload.islem === 'Cari'
        ? 'Evrak kaydedildi (cariye yazıldı)'
        : 'Evrak kaydedildi, ödeme yöntemi için otomatik makbuz satırları oluşturuldu',
    );
    await yukle();
  }
  async function makbuzKaydet(payload) {
    const j = await api('makbuzKaydet', { method: 'POST', body: payload });
    gecmiseEkle(j, `${payload.makbuzTuru} makbuzu`);
    bildir(`${payload.makbuzTuru} makbuzu kaydedildi`);
    await yukle();
  }
  async function hesapEkle(payload) {
    const j = await api('hesapEkle', { method: 'POST', body: payload });
    await yukle();
    return j.hesap;
  }

  function bitir(sonuc) {
    modal?.bitince?.(sonuc);
    setModal(null);
  }

  return (
    <div className="m2-shell m3-root">
      <div className="m2-ust">
        <button className="m2-back" onClick={() => (onNavigate ? onNavigate('settings') : (window.location.href = '/'))}>
          <ArrowLeft size={16} /> Geri
        </button>
        <div className="m2-ust-aksiyon">
          {duzenlemeModu && (
            <>
              <button className="m2-btn sec mini" disabled={gecmis.index < 0} onClick={() => geriIleri('geri')} title="Ctrl+Z">
                ↶ Geri Al
              </button>
              <button className="m2-btn sec mini" disabled={gecmis.index >= gecmis.liste.length - 1} onClick={() => geriIleri('ileri')} title="Ctrl+Shift+Z">
                ↷ İleri Al
              </button>
            </>
          )}
          <button
            type="button"
            className={`m2-mod-toggle ${duzenlemeModu ? 'edit' : ''}`}
            aria-pressed={duzenlemeModu}
            onClick={() => setDuzenlemeModu((v) => !v)}
            title="Datalar sekmesinde düzenleme ve silmeye izin verir"
          >
            <span className="thumb" />
            <span className="etiket e1">Basit Mod</span>
            <span className="etiket e2">Düzenleme Modu</span>
          </button>
        </div>
      </div>
      <h1 className="m2-title">
        Muhasebe3 <small>deneme — Hippos'a bağlı değil</small>
      </h1>

      {hata && <div className="m2-err">{hata}</div>}
      {veri.mizan && !veri.mizan.dengeli && (
        <div className="m3-mizan-uyari">
          Dikkat: defter dengesiz! Toplam borç {TL(veri.mizan.toplamBorc)} ≠ toplam alacak {TL(veri.mizan.toplamAlacak)}. Datalar sekmesinde bozuk kayıtlar işaretlenir.
        </div>
      )}

      <div className="m2-tabs">
        <button className={`m2-tab ${sekme === 'giris' ? 'on' : ''}`} onClick={() => setSekme('giris')}>
          Fişler/Faturalar ve Makbuzlar
        </button>
        <button className={`m2-tab ${sekme === 'datalar' ? 'on' : ''}`} onClick={() => setSekme('datalar')}>
          Datalar
        </button>
        <button className={`m2-tab ${sekme === 'cariler' ? 'on' : ''}`} onClick={() => setSekme('cariler')}>
          Cariler
        </button>
      </div>

      <div className="m2-grid" style={{ display: sekme === 'giris' ? undefined : 'none' }}>
        <div className="m2-card">
          <EvrakFormu veri={veri} bildir={bildir} onKaydet={evrakKaydet} onModal={setModal} />
        </div>
        <div className="m2-card">
          <MakbuzFormu veri={veri} bildir={bildir} onKaydet={makbuzKaydet} onModal={setModal} />
        </div>
      </div>
      <div style={{ display: sekme === 'datalar' ? undefined : 'none' }}>
        <DatalarSekmesi
          aktif={sekme === 'datalar'}
          hedef={datalarHedef}
          onGeri={() => setSekme('cariler')}
          duzenlemeModu={duzenlemeModu}
          veri={veri}
          bildir={bildir}
          yenile={yenileSayac}
          onIslem={gecmiseEkle}
          onDegisti={yukle}
        />
      </div>
      <div style={{ display: sekme === 'cariler' ? undefined : 'none' }}>
        <CarilerSekmesi
          aktif={sekme === 'cariler'}
          bildir={bildir}
          onDegisti={yukle}
          onModal={setModal}
          yenile={yenileSayac}
          onIslemeGit={(no, ad) => {
            setDatalarHedef({ key: Date.now(), no, geriAd: ad });
            setSekme('datalar');
          }}
        />
      </div>

      {modal?.tur === 'hesap' && (
        <HesapModal
          baslangicTur={modal.hesapTuru}
          baslangicAd={modal.ad}
          veri={veri}
          turSecenekleri={modal.turSecenekleri}
          onKaydet={hesapEkle}
          onBitti={bitir}
          onKapat={() => setModal(null)}
        />
      )}

      {toast && <div className={`m2-toast ${toast.hata ? 'hata' : ''}`}>{toast.mesaj}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cari (firma) seçici: yazdıkça arar.
// ---------------------------------------------------------------------------
function CariSecici({ hesaplar, valueId, onChange, onYeni, etiketTurleri }) {
  const liste = useMemo(() => hesaplar.filter((h) => etiketTurleri.includes(h.tur)), [hesaplar, etiketTurleri]);
  const secili = liste.find((f) => f.id === valueId) || null;
  const [metin, setMetin] = useState('');
  const [acik, setAcik] = useState(false);

  useEffect(() => {
    setMetin(secili ? secili.ad : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueId]);

  const sonuc = useMemo(() => {
    const q = trNorm(metin);
    return (q && !secili ? liste.filter((f) => trNorm(f.ad).includes(q)) : liste).slice(0, 8);
  }, [metin, liste, secili]);

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
                  {TUR_ETIKET[f.tur]} • {bakiyeEtiketi(f.bakiye).metin}
                </small>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Gider / Gelir hesapları: liste yerine tek tek seçilen butonlar, sonda "+ Yeni".
function HesapButonlari({ baslik, tur, hesaplar, secili, onSec, onYeni, zorunlu }) {
  const liste = hesaplar.filter((h) => h.tur === tur);
  return (
    <div className="m3-hesap-grup">
      <label className="m2-label">
        {baslik} {zorunlu && <b>*</b>}
      </label>
      <div className="m2-chips">
        {liste.map((h) => (
          <button type="button" key={h.id} className={`m2-chip ${secili === h.id ? 'on' : ''}`} onClick={() => onSec(h.id)}>
            {h.ad}
          </button>
        ))}
        <button type="button" className="m2-chip yeni" onClick={onYeni}>
          + Yeni {tur === 'gider' ? 'Gider Hesabı' : 'Gelir Hesabı'}
        </button>
      </div>
    </div>
  );
}

// Ödeme türü seçimi: tür -> kasa / kart / banka / ortak (hesaplardan gelir), sonda yeni yöntem.
function OdemeSecimi({ turler, tur, yontemId, onChange, hesaplar, onYeni, cariNotu }) {
  return (
    <div>
      <div className="m2-chips">
        {turler.map((t) => (
          <button type="button" key={t} className={`m2-chip ${tur === t ? 'on' : ''}`} onClick={() => onChange(t, '')}>
            {t}
          </button>
        ))}
        <button type="button" className="m2-chip yeni" onClick={() => onYeni('')}>
          + Yeni Yöntem
        </button>
      </div>
      {tur && ODEME_TURU_HESAP[tur] && (
        <div className="m2-chips alt">
          {hesaplar
            .filter((h) => h.tur === ODEME_TURU_HESAP[tur])
            .map((h) => (
              <button type="button" key={h.id} className={`m2-chip ${yontemId === h.id ? 'on' : ''}`} onClick={() => onChange(tur, h.id)}>
                {h.ad}
              </button>
            ))}
          <button type="button" className="m2-chip yeni" onClick={() => onYeni(ODEME_TURU_HESAP[tur])}>
            + {ALT_ETIKET[ODEME_TURU_HESAP[tur]]}
          </button>
        </div>
      )}
      {tur === 'Cari' && cariNotu && <p className="m2-hint">{cariNotu}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fiş / Fatura girişi
// ---------------------------------------------------------------------------
function EvrakFormu({ veri, bildir, onKaydet, onModal }) {
  const [satis, setSatis] = useState(false); // false: Alış Fişi/Faturası, true: Satış/İade Faturası
  const [tarih, setTarih] = useState(veri.bugun || bugunISO());
  const [firmaId, setFirmaId] = useState('');
  const [evrakNo, setEvrakNo] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [hesapId, setHesapId] = useState('');
  const [tutar, setTutar] = useState('');
  const [tur, setTur] = useState('');
  const [yontemId, setYontemId] = useState('');
  const [kaydediyor, setKaydediyor] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const firma = veri.hesaplar.find((f) => f.id === firmaId) || null;
  const t = sayi(tutar);

  function firmaSec(id, nesne) {
    setFirmaId(id);
    const f = nesne || veri.hesaplar.find((x) => x.id === id);
    if (f && f.giderHesabiId) setHesapId(f.giderHesabiId); // cariye bağlı gider hesabı otomatik gelir, elle değiştirilebilir
  }
  function modeDegistir(s) {
    setSatis(s);
    const h = veri.hesaplar.find((x) => x.id === hesapId);
    if (!s && h && h.tur !== 'gider') setHesapId('');
  }

  function hesapModal(hesapTuru) {
    onModal({ tur: 'hesap', hesapTuru, turSecenekleri: [hesapTuru], bitince: (h) => setHesapId(h.id) });
  }

  async function kaydet() {
    if (!tarih) return bildir('Tarih seçin', true);
    if (!firmaId) return bildir('Firma seçin', true);
    if (!hesapId) return bildir(satis ? 'Gelir/Gider hesabını seçin' : 'Gider hesabını seçin', true);
    if (!(t > 0)) return bildir('Tutarı girin', true);
    if (!tur) return bildir('Ödeme türünü seçin', true);
    if (tur !== 'Cari' && !yontemId) return bildir('Ödeme yöntemini seçin', true);
    setKaydediyor(true);
    try {
      await onKaydet({ evrak: satis ? 'satis' : 'alis', tarih, firmaId, evrakNo, aciklama, hesapId, tutar, islem: tur, yontemId });
      setFirmaId('');
      setEvrakNo('');
      setAciklama('');
      setHesapId('');
      setTutar('');
      setTur('');
      setYontemId('');
      setFormKey((k) => k + 1);
    } catch (e) {
      bildir(e.message, true);
    } finally {
      setKaydediyor(false);
    }
  }

  const yontem = veri.hesaplar.find((h) => h.id === yontemId);
  const hesap = veri.hesaplar.find((h) => h.id === hesapId);

  return (
    <>
      <div className="m2-fis-baslik">
        <h2>Fatura / Fiş Girişi</h2>
      </div>

      <div className={`m2-toggle ${satis ? 'odeme' : ''}`} role="group" aria-label="Evrak türü">
        <span className="m2-toggle-thumb" />
        <button type="button" className={satis ? '' : 'on'} onClick={() => modeDegistir(false)}>
          Alış Fişi/Faturası
        </button>
        <button type="button" className={satis ? 'on' : ''} onClick={() => modeDegistir(true)}>
          Satış/İade Faturası
        </button>
      </div>
      <p className="m2-hint">
        {satis
          ? 'Firma BORÇLANIR, seçilen gelir/gider hesabı ALACAKLANIR (satış geliri veya alış iadesi). Tutarı artı girin.'
          : 'Firma ALACAKLANIR, seçilen gider hesabı BORÇLANIR (işletmenin gideri).'}
      </p>

      <label className="m2-label">Tarih</label>
      <input className="m2-input" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />

      <label className="m2-label">
        Firma <b>*</b>
      </label>
      <CariSecici
        key={formKey}
        hesaplar={veri.hesaplar}
        etiketTurleri={['firma', 'ortak']}
        valueId={firmaId}
        onChange={firmaSec}
        onYeni={(ad) => onModal({ tur: 'hesap', hesapTuru: 'firma', turSecenekleri: ['firma'], ad, bitince: (h) => firmaSec(h.id, h) })}
      />
      {firma && <div className={`m2-info ${bakiyeEtiketi(firma.bakiye).ton}`}>Şu an: {bakiyeEtiketi(firma.bakiye).metin}</div>}

      <label className="m2-label">Evrak No</label>
      <input className="m2-input" placeholder="Opsiyonel" value={evrakNo} onChange={(e) => setEvrakNo(e.target.value)} />

      <label className="m2-label">Açıklama</label>
      <input className="m2-input" placeholder={hesap ? `Boşsa: ${hesap.ad}` : 'Boşsa gider hesabı adı yazılır'} value={aciklama} onChange={(e) => setAciklama(e.target.value)} />

      <HesapButonlari baslik="Gider Hesapları" tur="gider" hesaplar={veri.hesaplar} secili={hesapId} onSec={setHesapId} onYeni={() => hesapModal('gider')} zorunlu />
      {satis && (
        <HesapButonlari baslik="Gelir Hesapları" tur="gelir" hesaplar={veri.hesaplar} secili={hesapId} onSec={setHesapId} onYeni={() => hesapModal('gelir')} />
      )}

      <label className="m2-label">{satis ? 'Tahsilat Şekli' : 'Ödeme Türü'}</label>
      <OdemeSecimi
        turler={EVRAK_ODEME_TURLERI}
        tur={tur}
        yontemId={yontemId}
        onChange={(a, b) => {
          setTur(a);
          setYontemId(b);
        }}
        hesaplar={veri.hesaplar}
        onYeni={(hesapTuru) => onModal({ tur: 'hesap', hesapTuru: hesapTuru || ODEME_TURU_HESAP[tur] || 'kasa', turSecenekleri: ['kasa', 'banka', 'kart', 'ortak'], bitince: (h) => { setTur(Object.keys(ODEME_TURU_HESAP).find((k) => ODEME_TURU_HESAP[k] === h.tur)); setYontemId(h.id); } })}
        cariNotu="Cari olarak kaydedilir; makbuz oluşmaz, firmanın bakiyesine işler."
      />

      <label className="m2-label">
        {satis ? 'Satış/İade Tutarı' : 'Fatura Tutarı'} <b>*</b>
      </label>
      <input className="m2-input" type="number" step="any" min="0" placeholder="0,00" value={tutar} onChange={(e) => setTutar(e.target.value)} />

      {firma && t > 0 && tur === 'Cari' && (
        <div className={`m2-info ${bakiyeEtiketi(satis ? firma.bakiye + t : firma.bakiye - t).ton}`}>
          Bu kayıttan sonra: {bakiyeEtiketi(satis ? firma.bakiye + t : firma.bakiye - t).metin}
        </div>
      )}
      {firma && t > 0 && tur && tur !== 'Cari' && yontem && (
        <div className="m2-info">
          Otomatik oluşur: {firma.ad} için {satis ? 'Tahsilat' : 'Ödeme'} Makbuzu ve {yontem.ad} hesabına karşı satır. {firma.ad} bakiyesi değişmez.
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
function MakbuzFormu({ veri, bildir, onKaydet, onModal }) {
  const [makbuzTuru, setMakbuzTuru] = useState('Tahsilat');
  const [tarih, setTarih] = useState(veri.bugun || bugunISO());
  const [firmaId, setFirmaId] = useState('');
  const [evrakNo, setEvrakNo] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [hesapId, setHesapId] = useState('');
  const [tur, setTur] = useState('');
  const [yontemId, setYontemId] = useState('');
  const [tutar, setTutar] = useState('');
  const [kaydediyor, setKaydediyor] = useState(false);
  const [formKey, setFormKey] = useState(0);

  const firma = veri.hesaplar.find((f) => f.id === firmaId) || null;
  const yontem = veri.hesaplar.find((h) => h.id === yontemId) || null;
  const t = sayi(tutar);
  const tahsilat = makbuzTuru === 'Tahsilat';
  // Tahsilat: cari alacaklanır (bakiye azalır). Ödeme: cari borçlanır (bakiye artar).
  const yeniBakiye = firma ? firma.bakiye + (tahsilat ? -t : t) : 0;

  function firmaSec(id, nesne) {
    setFirmaId(id);
    const f = nesne || veri.hesaplar.find((x) => x.id === id);
    if (f && f.giderHesabiId) setHesapId(f.giderHesabiId);
  }

  async function kaydet() {
    if (!tarih) return bildir('Tarih seçin', true);
    if (!firmaId) return bildir('Firma seçin', true);
    if (!(t > 0)) return bildir('Tutarı girin', true);
    if (!tur) return bildir('Ödeme türünü seçin', true);
    if (!yontemId) return bildir('Ödeme yöntemini seçin', true);
    setKaydediyor(true);
    try {
      await onKaydet({ makbuzTuru, tarih, firmaId, evrakNo, aciklama, hesapId, tutar, islem: tur, yontemId });
      setFirmaId('');
      setEvrakNo('');
      setAciklama('');
      setHesapId('');
      setTur('');
      setYontemId('');
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
      <p className="m2-hint">
        {tahsilat
          ? 'Cariden aldığınız ödeme: cari ALACAKLANIR, seçilen ödeme yöntemi (kasa/banka/kart) BORÇLANIR.'
          : 'Cariye yaptığınız ödeme: cari BORÇLANIR, seçilen ödeme yöntemi (kasa/banka/kart) ALACAKLANIR.'}
      </p>

      <label className="m2-label">Tarih</label>
      <input className="m2-input" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />

      <label className="m2-label">
        Firma <b>*</b>
      </label>
      <CariSecici
        key={formKey}
        hesaplar={veri.hesaplar}
        etiketTurleri={['firma', 'ortak']}
        valueId={firmaId}
        onChange={firmaSec}
        onYeni={(ad) => onModal({ tur: 'hesap', hesapTuru: 'firma', turSecenekleri: ['firma'], ad, bitince: (h) => firmaSec(h.id, h) })}
      />
      {firma && <div className={`m2-info ${bakiyeEtiketi(firma.bakiye).ton}`}>Şu an: {bakiyeEtiketi(firma.bakiye).metin}</div>}

      <label className="m2-label">Evrak No</label>
      <input className="m2-input" placeholder="Opsiyonel" value={evrakNo} onChange={(e) => setEvrakNo(e.target.value)} />

      <label className="m2-label">Açıklama</label>
      <input className="m2-input" placeholder="Boşsa gider hesabı adı yazılır" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />

      <HesapButonlari
        baslik="Gider Hesapları"
        tur="gider"
        hesaplar={veri.hesaplar}
        secili={hesapId}
        onSec={setHesapId}
        onYeni={() => onModal({ tur: 'hesap', hesapTuru: 'gider', turSecenekleri: ['gider'], bitince: (h) => setHesapId(h.id) })}
      />

      <label className="m2-label">Ödeme Türü</label>
      <OdemeSecimi
        turler={MAKBUZ_ODEME_TURLERI}
        tur={tur}
        yontemId={yontemId}
        onChange={(a, b) => {
          setTur(a);
          setYontemId(b);
        }}
        hesaplar={veri.hesaplar}
        onYeni={(hesapTuru) => onModal({ tur: 'hesap', hesapTuru: hesapTuru || ODEME_TURU_HESAP[tur] || 'kasa', turSecenekleri: ['kasa', 'banka', 'kart', 'ortak'], bitince: (h) => { setTur(Object.keys(ODEME_TURU_HESAP).find((k) => ODEME_TURU_HESAP[k] === h.tur)); setYontemId(h.id); } })}
      />
      {yontem && (
        <p className="m2-hint">
          Otomatik: {yontem.ad} hesabına {tahsilat ? 'borç' : 'alacak'} satırı yazılır.
        </p>
      )}

      <label className="m2-label">
        {tahsilat ? 'Tahsilat Tutarı' : 'Ödeme Tutarı'} <b>*</b>
      </label>
      <input className="m2-input" type="number" step="any" min="0" placeholder="0,00" value={tutar} onChange={(e) => setTutar(e.target.value)} />

      {firma && t > 0 && <div className={`m2-info ${bakiyeEtiketi(yeniBakiye).ton}`}>Bu makbuzdan sonra: {bakiyeEtiketi(yeniBakiye).metin}</div>}

      <button className="m2-btn full" disabled={kaydediyor} onClick={kaydet}>
        {kaydediyor ? 'Kaydediliyor…' : `${makbuzTuru} Makbuzunu Kaydet`}
      </button>
    </>
  );
}

// ---------------------------------------------------------------------------
// Datalar: defter satırları (Fiş No, Tarih, Evrak Türü, Evrak No, Hesap Adı, Açıklama, İşlem, İşlem Türü, Borç, Alacak)
// ---------------------------------------------------------------------------
const FILTRE_KOLONLARI_3 = [
  { anahtar: 'islemNo', baslik: 'Fiş No' },
  { anahtar: 'tarih', baslik: 'Tarih' },
  { anahtar: 'evrakTuru', baslik: 'Evrak Türü' },
  { anahtar: 'hesapAdi', baslik: 'Hesap Adı' },
  { anahtar: 'islem', baslik: 'İşlem' },
  { anahtar: 'islemTuru', baslik: 'İşlem Türü' },
];
const DATALAR_SUTUNLAR = [
  { baslik: 'Fiş No', filtre: 'islemNo' },
  { baslik: 'Tarih', filtre: 'tarih' },
  { baslik: 'Evrak Türü', filtre: 'evrakTuru' },
  { baslik: 'Evrak No' },
  { baslik: 'Hesap Adı', filtre: 'hesapAdi' },
  { baslik: 'Açıklama' },
  { baslik: 'İşlem', filtre: 'islem' },
  { baslik: 'İşlem Türü', filtre: 'islemTuru' },
  { baslik: 'Borç', sayi: true },
  { baslik: 'Alacak', sayi: true },
];

function DatalarSekmesi({ aktif, duzenlemeModu, veri, bildir, yenile, onIslem, onDegisti, hedef, onGeri }) {
  const [kayitlar, setKayitlar] = useState(null);
  const [mizan, setMizan] = useState(null);
  const [sinirli, setSinirli] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState('');
  const [secim, setSecim] = useState(Object.fromEntries(FILTRE_KOLONLARI_3.map((k) => [k.anahtar, null])));
  const [menu, setMenu] = useState(null);
  const [duzenleGrup, setDuzenleGrup] = useState(null);
  const tarihDokunuldu = useRef(false);
  const govdeRef = useRef(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const j = await api('datalar');
      const liste = j.kayitlar || [];
      setKayitlar(liste);
      setMizan(j.mizan || null);
      setSinirli(!!j.sinirli);
      if (!tarihDokunuldu.current) setSecim((s) => ({ ...s, tarih: varsayilanTarihSecimi(liste, bugunISO()) }));
      setHata('');
    } catch (e) {
      setHata(e.message);
    } finally {
      setYukleniyor(false);
    }
  }, []);
  useEffect(() => {
    if (aktif) yukle();
  }, [aktif, yukle, yenile]);

  const degerler = useMemo(() => {
    const o = {};
    const liste = kayitlar || [];
    FILTRE_KOLONLARI_3.forEach(({ anahtar }) => {
      if (anahtar === 'tarih') o.tarih = [...new Set(liste.map((r) => r.tarih).filter(Boolean))].sort();
      else if (anahtar === 'islemNo') o.islemNo = [...new Set(liste.map((r) => r.islemNo ?? ''))].sort((a, b) => Number(b || 0) - Number(a || 0));
      else o[anahtar] = [...new Set(liste.map((r) => r[anahtar] ?? ''))].sort((a, b) => String(a).localeCompare(String(b), 'tr'));
    });
    return o;
  }, [kayitlar]);
  const gorunen = useMemo(() => filtreUygula(kayitlar || [], secim), [kayitlar, secim]);
  const grupSinifi = useMemo(() => grupSiniflari(gorunen), [gorunen]);
  const bozukNolar = useMemo(() => new Set((mizan?.bozukGruplar || []).map((g) => g.grupId)), [mizan]);
  const filtreAktif = Object.values(secim).some(Boolean);

  // Cariler ekstresindeki fiş numarasından gelindi: filtreler temizlenir, işlem ortaya kaydırılır ve vurgulanır.
  const [geriAd, setGeriAd] = useState(null);
  const [bekleyenNo, setBekleyenNo] = useState(null);
  useEffect(() => {
    if (!hedef) return;
    tarihDokunuldu.current = true;
    setSecim(Object.fromEntries(FILTRE_KOLONLARI_3.map((k) => [k.anahtar, null])));
    setGeriAd(hedef.geriAd);
    setBekleyenNo(hedef.no);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hedef && hedef.key]);
  useEffect(() => {
    if (!aktif) setGeriAd(null);
  }, [aktif]);
  useEffect(() => {
    if (!bekleyenNo || !aktif || !govdeRef.current) return undefined;
    const satirlar = Array.from(govdeRef.current.querySelectorAll(`tr[data-no="${bekleyenNo}"]`));
    if (!satirlar.length) return undefined;
    const zaman = setTimeout(() => {
      satirlar[Math.floor(satirlar.length / 2)].scrollIntoView({ block: 'center', behavior: 'smooth' });
      satirlar.forEach((x) => x.classList.add('g-flash'));
      setTimeout(() => satirlar.forEach((x) => x.classList.remove('g-flash')), 2600);
      setBekleyenNo(null);
    }, 120);
    return () => clearTimeout(zaman);
  }, [bekleyenNo, aktif, gorunen]);

  const sonGrup = useRef('');
  function grupVurgula(e) {
    const tr = e.target.closest ? e.target.closest('tr[data-grup]') : null;
    const g = tr && tr.classList.contains('g-coklu') ? tr.dataset.grup : '';
    if (g === sonGrup.current || !govdeRef.current) return;
    sonGrup.current = g;
    govdeRef.current.querySelectorAll('tr.g-vurgu').forEach((x) => x.classList.remove('g-vurgu'));
    if (g) govdeRef.current.querySelectorAll(`tr[data-grup="${g}"]`).forEach((x) => x.classList.add('g-vurgu'));
  }

  function secimDegistir(anahtar, yeni) {
    if (anahtar === 'tarih') tarihDokunuldu.current = true;
    setSecim((s) => ({ ...s, [anahtar]: yeni }));
  }
  function buAy() {
    tarihDokunuldu.current = false;
    setSecim((s) => ({ ...s, tarih: varsayilanTarihSecimi(kayitlar || [], bugunISO()) }));
  }
  function filtreleriTemizle() {
    tarihDokunuldu.current = true;
    setSecim(Object.fromEntries(FILTRE_KOLONLARI_3.map((k) => [k.anahtar, null])));
  }
  function menuAc(e, anahtar) {
    const r = e.currentTarget.getBoundingClientRect();
    setMenu((m) => (m && m.anahtar === anahtar ? null : { anahtar, top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 300)) }));
  }
  const menuKolon = menu ? FILTRE_KOLONLARI_3.find((k) => k.anahtar === menu.anahtar) : null;

  async function islemYap(kaynak, govde, etiket, ekle) {
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
  const alanDegistir = (r, alan, deger, etiket) => islemYap('kayitAlan', { grupId: r.grupId, alan, deger }, etiket);
  function grupSil(r) {
    const grup = (kayitlar || []).filter((x) => x.grupId === r.grupId);
    const mesaj = `Fiş No ${r.islemNo} — ${grup.length} satırdan oluşuyor:\n• ${grup.map((x) => `${x.hesapAdi} (${x.evrakTuru})`).join('\n• ')}\n\nHepsi silinecek. Emin misiniz?`;
    if (window.confirm(mesaj)) islemYap('kayitSil', { grupId: r.grupId }, `Fiş ${r.islemNo} silindi`, 'Kayıt silindi (Ctrl+Z ile geri alabilirsiniz)');
  }
  const para = (n) => (!n ? '' : sayiFmt.format(n));

  return (
    <div className="m2-card">
      {geriAd && (
        <div className="m2-geri-bar">
          <button type="button" className="m2-geri-dugme" onClick={onGeri}>
            ← {geriAd} ekstresine dön
          </button>
          <button type="button" className="m2-geri-kapat" aria-label="Kapat" onClick={() => setGeriAd(null)}>
            ×
          </button>
        </div>
      )}
      <div className="m2-row" style={{ justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Datalar</h2>
        <div className="m2-row" style={{ flexWrap: 'wrap' }}>
          {kayitlar && (
            <span className="m2-hint" style={{ margin: 0 }}>
              {gorunen.length} / {kayitlar.length} satır{sinirli ? ' (en yeni 20.000 yüklendi)' : ''}
            </span>
          )}
          <div className="m2-dt-btnler">
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
      </div>

      {hata && <div className="m2-info r">{hata}</div>}
      {mizan && (
        <div className={`m3-mizan ${mizan.dengeli ? 'ok' : 'bozuk'}`}>
          {mizan.dengeli
            ? `Mizan dengeli: toplam borç ${TL(mizan.toplamBorc)} = toplam alacak ${TL(mizan.toplamAlacak)}`
            : `DENGESİZ: toplam borç ${TL(mizan.toplamBorc)} ≠ toplam alacak ${TL(mizan.toplamAlacak)}${mizan.bozukGruplar.length ? ` — bozuk fiş no: ${mizan.bozukGruplar.map((g) => g.no).join(', ')}` : ''}`}
        </div>
      )}

      <div className="m2-table-wrap">
        <table className="m2-table m2-datalar">
          <thead>
            <tr>
              {DATALAR_SUTUNLAR.map((s) => (
                <th key={s.baslik} className={s.sayi ? 'sayi' : ''}>
                  <div className="m2-th">
                    <span>{s.baslik}</span>
                    {s.filtre && (
                      <button type="button" data-filtre-dugme className={`m2-fb ${secim[s.filtre] ? 'on' : ''}`} aria-label={`${s.baslik} filtresi`} onClick={(e) => menuAc(e, s.filtre)}>
                        <Filter size={12} />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              {duzenlemeModu && <th>İşlem</th>}
            </tr>
          </thead>
          <tbody ref={govdeRef} onMouseOver={grupVurgula} onMouseLeave={grupVurgula}>
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
            {gorunen.map((r, i) => (
              <tr key={r.id} data-grup={r.grupId || undefined} data-no={r.islemNo || undefined} className={`${r.otomatik ? 'oto ' : ''}${bozukNolar.has(r.grupId) ? 'm3-bozuk ' : ''}${grupSinifi[i]}`}>
                <td className="m2-no">{r.islemNo}</td>
                <td className="nowrap">
                  <Hucre aktif={duzenlemeModu} tur="date" deger={r.tarih} metin={tarihTR(r.tarih)} onKaydet={(v) => alanDegistir(r, 'tarih', v, 'tarih değişikliği')} />
                </td>
                <td className="nowrap">
                  {r.otomatik && <span className="m2-oto-ok" title="Otomatik oluşan satır">↳ </span>}
                  <span className={`m2-badge ${EVRAK_SINIFI[r.evrakTuru] || ''}`}>{r.evrakTuru}</span>
                </td>
                <td>
                  <Hucre aktif={duzenlemeModu} deger={r.evrakNo} metin={r.evrakNo} onKaydet={(v) => alanDegistir(r, 'evrakNo', v, 'evrak no değişikliği')} />
                </td>
                <td>{r.hesapAdi}</td>
                <td>
                  <Hucre aktif={duzenlemeModu} deger={r.aciklama} metin={r.aciklama} onKaydet={(v) => alanDegistir(r, 'aciklama', v, 'açıklama değişikliği')} />
                </td>
                <td className="nowrap">{r.islem}</td>
                <td className="nowrap">{r.islemTuru}</td>
                <td className="sayi">
                  <Hucre aktif={duzenlemeModu && !!r.borc} deger={String(r.borc)} metin={para(r.borc)} onKaydet={(v) => alanDegistir(r, 'tutar', v, 'tutar değişikliği')} />
                </td>
                <td className="sayi">
                  <Hucre aktif={duzenlemeModu && !!r.alacak} deger={String(r.alacak)} metin={para(r.alacak)} onKaydet={(v) => alanDegistir(r, 'tutar', v, 'tutar değişikliği')} />
                </td>
                {duzenlemeModu && (
                  <td className="m2-islem-td">
                    <div className="m2-yk-islem">
                      <button className="m2-btn sec mini" onClick={() => setDuzenleGrup(r)}>
                        Düzenle
                      </button>
                      <button className="m2-btn sec mini" onClick={() => grupSil(r)}>
                        Sil
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {gorunen.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={8}>Toplam (görünen satırlar)</td>
                <td className="sayi">{sayiFmt.format(gorunen.reduce((t, r) => t + r.borc, 0))}</td>
                <td className="sayi">{sayiFmt.format(gorunen.reduce((t, r) => t + r.alacak, 0))}</td>
                {duzenlemeModu && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="m2-hint">
        Aynı fiş numaralı satırlar tek işlemdir (aynı renk bloğu). Düzenleme ve silme her zaman işlemin TÜM satırlarını birlikte etkiler; böylece borç ve alacak hep eşit kalır.
      </p>

      {duzenleGrup && (
        <KayitDuzenleModal
          satir={duzenleGrup}
          satirlar={(kayitlar || []).filter((x) => x.grupId === duzenleGrup.grupId)}
          veri={veri}
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

function Hucre({ aktif, tur = 'text', deger, metin, onKaydet }) {
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
  const bitir = (kaydet) => {
    setAcik(false);
    if (kaydet && v !== (deger || '')) onKaydet(v);
  };
  return (
    <input
      autoFocus
      className="m2-input m2-hucre-input"
      type={tur === 'date' ? 'date' : 'text'}
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

// Bir işlemin (grubun) tüm satırlarını aynı alanlarla düzenler.
function KayitDuzenleModal({ satir, satirlar, veri, onKaydet, onKapat }) {
  const cariSatir = satirlar.find((x) => x.rol === 'cari');
  const hesapSatir = satirlar.find((x) => x.rol === 'hesap');
  const yontemSatir = satirlar.find((x) => x.rol === 'yontem');
  const [tarih, setTarih] = useState(satir.tarih);
  const [evrakNo, setEvrakNo] = useState(satir.evrakNo || '');
  const [aciklama, setAciklama] = useState(satir.aciklama || '');
  const [tutar, setTutar] = useState(String(satirlar[0] ? satirlar[0].borc || satirlar[0].alacak : ''));
  const [cariId, setCariId] = useState(cariSatir ? cariSatir.hesapId : '');
  const [hesapId, setHesapId] = useState(hesapSatir ? hesapSatir.hesapId : '');
  const [yontemId, setYontemId] = useState(yontemSatir ? yontemSatir.hesapId : '');
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const sec = (turler) => veri.hesaplar.filter((h) => turler.includes(h.tur));

  async function kaydet() {
    setBekliyor(true);
    setHata('');
    try {
      await onKaydet({ grupId: satir.grupId, tarih, evrakNo, aciklama, tutar, cariId, hesapId, yontemId });
      onKapat();
    } catch (e) {
      setHata(e.message);
      setBekliyor(false);
    }
  }
  const hesapSelect = (deger, set, liste) => (
    <select className="m2-select" value={deger} onChange={(e) => set(e.target.value)}>
      {liste.map((h) => (
        <option key={h.id} value={h.id}>
          {h.ad}
        </option>
      ))}
    </select>
  );
  return (
    <ModalKabuk baslik={`Fiş No ${satir.islemNo} — Düzenle`} onKapat={onKapat}>
      <p className="m2-hint">{satirlar.length} satırın hepsi birlikte güncellenir (otomatik karşı satırlar dahil).</p>
      <label className="m2-label">Tarih</label>
      <input className="m2-input" type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} />
      <label className="m2-label">Evrak No</label>
      <input className="m2-input" value={evrakNo} onChange={(e) => setEvrakNo(e.target.value)} />
      <label className="m2-label">Açıklama</label>
      <input className="m2-input" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
      <label className="m2-label">Tutar</label>
      <input className="m2-input" type="number" step="any" min="0" value={tutar} onChange={(e) => setTutar(e.target.value)} />
      {cariSatir && (
        <>
          <label className="m2-label">Firma / Cari</label>
          {hesapSelect(cariId, setCariId, sec(['firma', 'ortak']))}
        </>
      )}
      {hesapSatir && (
        <>
          <label className="m2-label">Gider / Gelir Hesabı</label>
          {hesapSelect(hesapId, setHesapId, sec(['gider', 'gelir']))}
        </>
      )}
      {yontemSatir && (
        <>
          <label className="m2-label">Ödeme Yöntemi</label>
          {hesapSelect(yontemId, setYontemId, sec(['kasa', 'banka', 'kart', 'ortak']))}
        </>
      )}
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon onKapat={onKapat} bekliyor={bekliyor} devreDisi={!(sayi(tutar) > 0)} onKaydet={kaydet} />
    </ModalKabuk>
  );
}

// ---------------------------------------------------------------------------
// Cariler: hesap kartları, filtreler, düzenleme, ekstre ve PDF. Bakiye = Borç − Alacak.
// ---------------------------------------------------------------------------
const GRUPLAR = [
  { anahtar: 'firma', etiket: 'Firmalar' },
  { anahtar: 'gider', etiket: 'Gider Hesapları' },
  { anahtar: 'gelir', etiket: 'Gelir Hesapları' },
  { anahtar: 'kasa', etiket: 'Kasalar' },
  { anahtar: 'banka', etiket: 'Bankalar' },
  { anahtar: 'kart', etiket: 'Kredi Kartları' },
  { anahtar: 'ortak', etiket: 'Ortaklar' },
];

function CarilerSekmesi({ aktif, bildir, onDegisti, onModal, onIslemeGit, yenile }) {
  const [hesaplar, setHesaplar] = useState(null);
  const [mizan, setMizan] = useState(null);
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [ara, setAra] = useState('');
  const [bolum, setBolum] = useState('tumu');
  const [bakiyesizGizle, setBakiyesizGizle] = useState(false);
  const [sirala, setSirala] = useState('bakiye');
  const [ekstre, setEkstre] = useState(null);
  const [duzenle, setDuzenle] = useState(null);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const j = await api('hesapOzetleri');
      setHesaplar(j.hesaplar || []);
      setMizan(j.mizan || null);
      setHata('');
    } catch (e) {
      setHata(e.message);
    } finally {
      setYukleniyor(false);
    }
  }, []);
  useEffect(() => {
    if (aktif) yukle();
  }, [aktif, yukle, yenile]);

  const gorunen = useMemo(() => {
    let l = hesaplar || [];
    const q = trNorm(ara);
    if (q) l = l.filter((f) => trNorm(f.ad).includes(q));
    if (bolum !== 'tumu') l = l.filter((f) => f.tur === bolum);
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
  }, [hesaplar, ara, bolum, bakiyesizGizle, sirala]);

  async function hesapGuncelle(payload) {
    await api('hesapGuncelle', { method: 'POST', body: payload });
    bildir('Hesap bilgileri güncellendi; tüm eski kayıtlarda ve formlarda yeni ad görünür');
    await yukle();
    await onDegisti?.();
  }

  const chip = (deger, secili, set, etiket) => (
    <button type="button" key={deger} className={`m2-chip ${secili === deger ? 'on' : ''}`} onClick={() => set(deger)}>
      {etiket}
    </button>
  );

  return (
    <div className="m2-card">
      <div className="m2-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Cariler</h2>
        <div className="m2-row">
          <button
            className="m2-btn mini"
            onClick={() => onModal({ tur: 'hesap', hesapTuru: bolum !== 'tumu' ? bolum : 'firma', turSecenekleri: HESAP_TURLERI_HEPSI, bitince: () => { yukle(); onDegisti?.(); } })}
          >
            <Plus size={14} style={{ verticalAlign: '-2px' }} /> Yeni Cari
          </button>
          <button className="m2-btn sec mini" onClick={yukle} disabled={yukleniyor}>
            {yukleniyor ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>
      </div>

      {hata && <div className="m2-info r">{hata}</div>}
      {mizan && (
        <div className={`m3-mizan ${mizan.dengeli ? 'ok' : 'bozuk'}`}>
          {mizan.dengeli
            ? `Mizan dengeli: toplam borç ${TL(mizan.toplamBorc)} = toplam alacak ${TL(mizan.toplamAlacak)}`
            : `DENGESİZ: toplam borç ${TL(mizan.toplamBorc)} ≠ toplam alacak ${TL(mizan.toplamAlacak)} — Datalar sekmesinde bozuk kayıtlar işaretlenir`}
        </div>
      )}

      <div className="m2-toolbar">
        <input className="m2-input m2-ara" placeholder="Cari ara…" value={ara} onChange={(e) => setAra(e.target.value)} />
        <div className="m2-chips tight sar">
          {chip('tumu', bolum, setBolum, 'Tüm hesaplar')}
          {GRUPLAR.map((g) => chip(g.anahtar, bolum, setBolum, g.etiket))}
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
        {hesaplar ? `${gorunen.length} / ${hesaplar.length} hesap` : ''} — Bakiye = Borç − Alacak. Firmalarda eksi bakiye: firma alacaklı (borcumuz var), artı bakiye: firma bize borçlu.
      </div>
      {hesaplar && hesaplar.length === 0 && <div className="m2-empty">Henüz hesap yok. Fiş/Faturalar sekmesinden gider hesabı, firma ve ödeme yöntemi ekleyerek başlayın.</div>}
      {hesaplar && hesaplar.length > 0 && gorunen.length === 0 && <div className="m2-empty">Bu filtreye uyan hesap yok.</div>}

      <div className="m2-hc-grid">
        {gorunen.map((f) => {
          const d = durumBul(f.bakiye);
          const m = hesapBakiyeMetni(f);
          return (
            <div key={f.id} className={`m2-hc-kart ${d}`} role="button" tabIndex={0} onClick={() => setEkstre(f)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setEkstre(f)}>
              <button
                type="button"
                className="m2-hc-duzenle"
                title="Hesabı düzenle"
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
                <div className="m2-hc-tag">
                  {TUR_ETIKET[f.tur]}
                  {f.giderHesabiAd ? ` • ${f.giderHesabiAd}` : ''}
                </div>
              </div>
              <div>
                <div className="m2-hc-tutar">{m.tutar}</div>
                <div className="m2-hc-durum">{m.durum}</div>
              </div>
            </div>
          );
        })}
      </div>

      {ekstre && <EkstreModal hesap={ekstre} aktif={aktif} onIslemeGit={onIslemeGit} bildir={bildir} onKapat={() => setEkstre(null)} />}
      {duzenle && <HesapDuzenleModal hesap={duzenle} giderler={(hesaplar || []).filter((h) => h.tur === 'gider')} onKaydet={hesapGuncelle} onBitti={() => setDuzenle(null)} onKapat={() => setDuzenle(null)} />}
    </div>
  );
}
const HESAP_TURLERI_HEPSI = ['firma', 'gider', 'gelir', 'kasa', 'banka', 'kart', 'ortak'];

function HesapDuzenleModal({ hesap, giderler, onKaydet, onBitti, onKapat }) {
  const [ad, setAd] = useState(hesap.ad);
  const [giderId, setGiderId] = useState(hesap.giderHesabiId || '');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);
  const giderGerek = !['gider', 'gelir'].includes(hesap.tur);
  const zorunlu = hesap.tur === 'firma';
  return (
    <ModalKabuk baslik={`${TUR_ETIKET[hesap.tur]} — Düzenle`} onKapat={onKapat}>
      <label className="m2-label">Hesap Adı</label>
      <input className="m2-input" autoFocus value={ad} onChange={(e) => setAd(e.target.value)} />
      <p className="m2-hint">Ad değişince tüm eski kayıtlarda, Datalar'da, ekstrelerde ve formlardaki seçim butonlarında yeni ad görünür. Hesaplar silinemez, yalnızca adı değişir.</p>
      {giderGerek && (
        <>
          <label className="m2-label">
            Bağlı Gider Hesabı {zorunlu && <b>*</b>}
          </label>
          <select className="m2-select" value={giderId} onChange={(e) => setGiderId(e.target.value)}>
            {!zorunlu && <option value="">— Yok —</option>}
            {zorunlu && !giderId && <option value="">— Seçin —</option>}
            {giderler.map((g) => (
              <option key={g.id} value={g.id}>
                {g.ad}
              </option>
            ))}
          </select>
          <p className="m2-hint">Formlarda bu cari seçilince bu gider hesabı otomatik gelir (elle değiştirilebilir). Eski kayıtları değiştirmez.</p>
        </>
      )}
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon
        onKapat={onKapat}
        devreDisi={!ad.trim() || (zorunlu && !giderId)}
        bekliyor={bekliyor}
        onKaydet={() => calistir({ id: hesap.id, ad, ...(giderGerek ? { giderHesabiId: giderId } : {}) })}
      />
    </ModalKabuk>
  );
}

// Yeni hesap penceresi: firma eklerken gider hesabı zorunlu.
function HesapModal({ baslangicTur, baslangicAd, veri, turSecenekleri, onKaydet, onBitti, onKapat }) {
  const secenekler = turSecenekleri && turSecenekleri.length ? turSecenekleri : [baslangicTur];
  const [tur, setTur] = useState(secenekler.includes(baslangicTur) ? baslangicTur : secenekler[0]);
  const [ad, setAd] = useState(baslangicAd || '');
  const [giderId, setGiderId] = useState('');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);
  const giderler = veri.hesaplar.filter((h) => h.tur === 'gider');
  const giderGerek = !['gider', 'gelir'].includes(tur);
  const zorunlu = tur === 'firma';
  const eksikGider = zorunlu && giderler.length === 0;
  return (
    <ModalKabuk baslik={`Yeni ${TUR_ETIKET[tur]}`} onKapat={onKapat}>
      {secenekler.length > 1 && (
        <>
          <label className="m2-label">Hesap Türü</label>
          <div className="m2-chips">
            {secenekler.map((t) => (
              <button type="button" key={t} className={`m2-chip ${tur === t ? 'on' : ''}`} onClick={() => setTur(t)}>
                {TUR_ETIKET[t]}
              </button>
            ))}
          </div>
        </>
      )}
      <label className="m2-label">Ad</label>
      <input className="m2-input" autoFocus value={ad} onChange={(e) => setAd(e.target.value)} />
      {giderGerek && (
        <>
          <label className="m2-label">
            Bağlı Gider Hesabı {zorunlu && <b>*</b>}
          </label>
          <select className="m2-select" value={giderId} onChange={(e) => setGiderId(e.target.value)}>
            <option value="">{zorunlu ? '— Seçin —' : '— Yok —'}</option>
            {giderler.map((g) => (
              <option key={g.id} value={g.id}>
                {g.ad}
              </option>
            ))}
          </select>
          {eksikGider && <p className="m2-hint">Önce bir Gider Hesabı eklemelisiniz (formdaki “+ Yeni Gider Hesabı” butonu).</p>}
        </>
      )}
      {(tur === 'gider' || tur === 'gelir') && <p className="m2-hint">Bu hesap otomatik olarak cari hesap olarak açılır; Cariler sekmesinde ekstresi görünür.</p>}
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon
        onKapat={onKapat}
        devreDisi={!ad.trim() || (zorunlu && !giderId)}
        bekliyor={bekliyor}
        onKaydet={() => calistir({ ad, tur, ...(giderGerek && giderId ? { giderHesabiId: giderId } : {}) })}
      />
    </ModalKabuk>
  );
}

function EkstreModal({ hesap, bildir, onKapat, aktif = true, onIslemeGit }) {
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState('');
  const [aralik, setAralik] = useState('tumu');
  const [bas, setBas] = useState('');
  const [bit, setBit] = useState('');
  const [kapaliGizle, setKapaliGizle] = useState(false);
  const [pdfBekliyor, setPdfBekliyor] = useState(false);
  const bugun = bugunISO();
  const wrapRef = useRef(null);
  const geriKonum = useRef(null);

  useEffect(() => {
    if (!aktif) return undefined;
    let iptal = false;
    api('ekstre', { query: { hesapId: hesap.id } })
      .then((j) => !iptal && setVeri(j))
      .catch((e) => !iptal && setHata(e.message));
    return () => {
      iptal = true;
    };
  }, [hesap.id, aktif]);

  const baslangic = aralik === 'buyil' ? `${bugun.slice(0, 4)}-01-01` : aralik === 'ozel' ? bas : '';
  const bitis = aralik === 'ozel' ? bit : '';
  const gorunum = useMemo(() => (veri ? ekstreGorunum(veri.satirlar, { baslangic, bitis, kapaliGizle }) : null), [veri, baslangic, bitis, kapaliGizle]);
  const d = gorunum ? durumBul(gorunum.bakiye) : 'yok';
  const grupSinifi = useMemo(() => grupSiniflari(gorunum ? gorunum.satirlar : []), [gorunum]);
  const firmaMi = hesap.tur === 'firma' || hesap.tur === 'ortak';
  const DURUM = firmaMi ? { alacakli: 'Alacaklı', borclu: 'Borçlu', yok: 'Bakiye yok' } : { alacakli: 'Alacak bakiyesi', borclu: 'Borç bakiyesi', yok: 'Bakiye yok' };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (geriKonum.current != null && aktif) {
      el.scrollTop = geriKonum.current;
      geriKonum.current = null;
    } else if (geriKonum.current == null) {
      el.scrollTop = el.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gorunum]);

  async function pdfPaylas() {
    setPdfBekliyor(true);
    try {
      const aralikMetni = aralik === 'tumu' ? 'Tüm işlemler' : `${tarihTR(baslangic)} - ${tarihTR(bitis || bugun)}`;
      const tanim = ekstrePdfTanimi({ firmaAdi: hesap.ad, aralikMetni, gorunum, olusturma: tarihTR(bugun) });
      const blob = await ekstrePdfUret(tanim);
      const sonuc = await pdfPaylasVeyaIndir(blob, dosyaAdi(hesap.ad, bugun));
      if (sonuc === 'indirildi') bildir('PDF indirildi');
      else if (sonuc === 'paylasildi') bildir('PDF paylaşıldı');
    } catch (e) {
      bildir(e.message || 'PDF oluşturulamadı', true);
    } finally {
      setPdfBekliyor(false);
    }
  }

  return (
    <ModalKabuk baslik={`${hesap.ad} — Hesap Özeti`} onKapat={onKapat} genis>
      {hata && <div className="m2-info r">{hata}</div>}
      {!veri && !hata && <div className="m2-empty">Yükleniyor…</div>}
      {gorunum && (
        <>
          <div className={`m2-ekstre-ozet ${d}`}>
            <div>
              <div className="m2-hc-durum">{DURUM[d]}</div>
              <div className="m2-hc-tutar">{d === 'yok' ? '—' : TL(Math.abs(gorunum.bakiye))}</div>
            </div>
            <div className="m2-hc-yardim" style={{ maxWidth: 360 }}>
              Bakiye = Borç − Alacak. {firmaMi ? 'Eksi (−) bakiye: firma alacaklı, borcumuz var. Artı (+) bakiye: firma borçlu.' : 'Eksi (−): toplam alacak fazla, artı (+): toplam borç fazla.'}
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
                  <th>Fiş No</th>
                  <th>Tarih</th>
                  <th>Evrak Türü</th>
                  <th>Evrak No</th>
                  <th>Açıklama</th>
                  <th>İşlem</th>
                  <th className="sayi">Borç</th>
                  <th className="sayi">Alacak</th>
                  <th className="sayi">Bakiye</th>
                </tr>
              </thead>
              <tbody>
                {gorunum.satirlar.length === 0 && !gorunum.devir && (
                  <tr>
                    <td colSpan={9} className="m2-empty">
                      Bu hesap için işlem yok.
                    </td>
                  </tr>
                )}
                {gorunum.devir && (
                  <tr className="oto g-tek">
                    <td className="m2-no" />
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
                {gorunum.satirlar.map((r, i) => (
                  <tr key={r.id} className={`${r.otomatik ? 'oto ' : ''}${grupSinifi[i]}`}>
                    <td className="m2-no">
                      {r.islemNo && onIslemeGit ? (
                        <button
                          type="button"
                          className="m2-no-link"
                          title={`Datalar'da göster (Fiş No ${r.islemNo})`}
                          onClick={() => {
                            geriKonum.current = wrapRef.current ? wrapRef.current.scrollTop : null;
                            onIslemeGit(r.islemNo, hesap.ad);
                          }}
                        >
                          {r.islemNo}
                        </button>
                      ) : (
                        r.islemNo
                      )}
                    </td>
                    <td className="nowrap">{tarihTR(r.tarih)}</td>
                    <td className="nowrap">
                      {r.otomatik && <span className="m2-oto-ok">↳ </span>}
                      <span className={`m2-badge ${EVRAK_SINIFI[r.evrakTuru] || ''}`}>{r.evrakTuru}</span>
                    </td>
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
                  <td colSpan={6}>Toplam</td>
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
          <p className="m2-hint">İşlemler eskiden yeniye sıralıdır, PDF ile aynı. Fiş numarasına tıklayınca Datalar'da o işlem açılır.</p>
        </>
      )}
    </ModalKabuk>
  );
}
