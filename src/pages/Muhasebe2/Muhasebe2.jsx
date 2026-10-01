import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, X } from 'lucide-react';
import './Muhasebe2.css';

// ---------------------------------------------------------------------------
// Muhasebe2 — "Fişler/Faturalar ve Makbuzlar" sekmesi.
// Sol: Fiş/Fatura girişi. Sağ: Tahsilat / Ödeme makbuzu (kaydırmalı anahtar).
// Bu aşamada sadece kayıt yapılır; ödeme yöntemi bilgileri (kasa, banka, kart)
// ileride açılacak sekmeler için Supabase'de saklanır.
// ---------------------------------------------------------------------------

const KASALAR = ['Günlük Kasa', 'Çelik Kasa'];
const FATURA_ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi', 'Cari'];
const MAKBUZ_ODEME_TURLERI = ['Nakit', 'Kredi Kartı', 'Banka Havalesi'];

const para = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' });
const TL = (n) => para.format(Number(n) || 0);

function bugunISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}
// Arama için: büyük/küçük harf, ı/i ve Türkçe karakter farklarını yok sayar.
function trNorm(s) {
  return String(s || '')
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
function sayi(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Bakiye: pozitif = bizim borcumuz, negatif = firma bize borçlu.
function bakiyeEtiketi(b) {
  const v = Math.round((Number(b) || 0) * 100) / 100;
  if (v === 0) return { metin: 'Bakiye yok', ton: '' };
  return v > 0 ? { metin: `Borcumuz ${TL(v)}`, ton: 'r' } : { metin: `Bize borçlu ${TL(-v)}`, ton: 'g' };
}

async function api(resource, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/muhasebe2?resource=${resource}`, {
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

// ---------------------------------------------------------------------------
// Ana bileşen
// ---------------------------------------------------------------------------
export default function Muhasebe2({ onNavigate }) {
  const [veri, setVeri] = useState({ firmalar: [], kategoriler: [], odemeYontemleri: [], bugun: '' });
  const [hata, setHata] = useState('');
  const [toast, setToast] = useState(null);
  const [modal, setModal] = useState(null); // {tur, ad, odemeTuru, bitince}
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

  async function fisFaturaKaydet(payload) {
    await api('fisFaturaKaydet', { method: 'POST', body: payload });
    bildir(payload.odemeTuru === 'Cari' ? 'Fatura kaydedildi (cariye yazıldı)' : 'Fatura kaydedildi');
    await yukle();
  }
  async function makbuzKaydet(payload) {
    await api('makbuzKaydet', { method: 'POST', body: payload });
    bildir(`${payload.makbuzTuru} makbuzu kaydedildi`);
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
      <button className="m2-back" onClick={() => (onNavigate ? onNavigate('settings') : (window.location.href = '/'))}>
        <ArrowLeft size={16} /> Geri
      </button>
      <h1 className="m2-title">
        Muhasebe2 <small>test</small>
      </h1>

      {hata && <div className="m2-err">{hata}</div>}

      <div className="m2-tabs">
        <button className="m2-tab on">Fişler/Faturalar ve Makbuzlar</button>
      </div>

      <div className="m2-grid">
        <div className="m2-card">
          <FisFaturaFormu veri={veri} bildir={bildir} onKaydet={fisFaturaKaydet} onModal={setModal} />
        </div>
        <div className="m2-card">
          <MakbuzFormu veri={veri} bildir={bildir} onKaydet={makbuzKaydet} onModal={setModal} />
        </div>
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
                <small>{bakiyeEtiketi(f.bakiye).metin}</small>
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
          <button type="button" key={t} className={`m2-chip ${tur === t ? 'on' : ''}`} onClick={() => onChange(t, '')}>
            {t}
          </button>
        ))}
        <button type="button" className="m2-chip yeni" onClick={() => onYeni('')}>
          + Yeni Yöntem
        </button>
      </div>

      {tur === 'Nakit' && <div className="m2-chips alt">{KASALAR.map(altChip)}</div>}
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
    const y = yontemPayload(tur, detay);
    if (y.hata) return bildir(y.hata, true);
    setKaydediyor(true);
    try {
      await onKaydet({ tarih, firmaId, faturaNo, aciklama, giderKategorisi: kategori, faturaTutari: tutar, ...y });
      setFirmaId('');
      setFaturaNo('');
      setAciklama('');
      setKategori('');
      setTutar('');
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
        Fatura Tutarı <b>*</b>
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

      {firma && t > 0 && tur === 'Cari' && (
        <div className={`m2-info ${bakiyeEtiketi(firma.bakiye + t).ton}`}>
          Bu kayıttan sonra: {bakiyeEtiketi(firma.bakiye + t).metin}
        </div>
      )}
      {firma && t > 0 && tur && tur !== 'Cari' && (
        <div className="m2-info">Peşin ödeme olduğu için cari bakiye değişmez.</div>
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
// Modallar: yeni firma / kategori / ödeme yöntemi
// ---------------------------------------------------------------------------
function ModalKabuk({ baslik, onKapat, children }) {
  return (
    <div className="m2-modal-bg" onClick={onKapat}>
      <div className="m2-modal" onClick={(e) => e.stopPropagation()}>
        <div className="m2-modal-head">
          <h3>{baslik}</h3>
          <button onClick={onKapat} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function useModalKaydet(onKaydet, onBitti) {
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  async function calistir(payload) {
    setBekliyor(true);
    setHata('');
    try {
      const sonuc = await onKaydet(payload);
      onBitti(sonuc);
    } catch (e) {
      setHata(e.message);
      setBekliyor(false);
    }
  }
  return { hata, bekliyor, calistir };
}

function ModalAksiyon({ onKapat, onKaydet, devreDisi, bekliyor }) {
  return (
    <div className="m2-modal-actions">
      <button className="m2-btn sec" onClick={onKapat}>
        Vazgeç
      </button>
      <button className="m2-btn" disabled={devreDisi || bekliyor} onClick={onKaydet}>
        {bekliyor ? '…' : 'Kaydet'}
      </button>
    </div>
  );
}

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
        <option value="Kredi Kartı">Kredi Kartı</option>
        <option value="Banka Havalesi">Banka Havalesi</option>
      </select>
      <label className="m2-label">Ad</label>
      <input
        className="m2-input"
        autoFocus
        placeholder={odemeTuru === 'Kredi Kartı' ? 'Örn. Garanti Kredi Kartı' : 'Örn. Garanti Bankası'}
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