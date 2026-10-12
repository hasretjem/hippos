import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Plus, Settings, Trash2 } from 'lucide-react';
import { ModalAksiyon, ModalKabuk, TL, api, bugunISO, sayi, tarihTR, useModalKaydet } from '../Muhasebe2/m2Ortak';
import '../Muhasebe2/Muhasebe2.css';
import './PersonelKlasoru.css';

// ---------------------------------------------------------------------------
// Maaş Günü Aracı: maaş gününde her personele ne ödeyeceğini gösterir ve hızlı ödeme yaptırır.
//  - Toplam Maaş = personel carisindeki tutar (izin ve avanslar zaten düşülmüş).
//  - Sigortalı personelde banka payı (asgari ücret) havaleyle, kalanı nakit ödenir; sigortasızda tamamı nakittir.
//  - İzinler / Avanslar sütunları yalnızca bilgi içindir, hesaba tekrar katılmaz.
//  - Ödeme, Personel Klasörü'ndeki avansla aynı kayıt akışını kullanır: personel carisine Ödeme Makbuzu + ödeme şekline karşı makbuz.
// Tutarlar varsayılan olarak GİZLİDİR (göz butonu); gizliyken sunucu tutarları hiç göndermez.
// ---------------------------------------------------------------------------

const GIZLI = '••••••';
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const donemYazi = (d) => `${AYLAR[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;

// Ödeme yöntemleri: fiş/fatura ile aynı türler + Günlük Kasa (TL Kasa'dan, çekmeceden).
const YONTEMLER = [
  { k: 'tl', e: 'TL Kasa', tur: 'Nakit' },
  { k: 'gunluk', e: 'Günlük Kasa', tur: 'Nakit' },
  { k: 'Banka Havalesi', e: 'Banka Havalesi', tur: 'Banka Havalesi' },
  { k: 'Kredi Kartı', e: 'Kredi Kartı', tur: 'Kredi Kartı' },
  { k: 'Ortaklar', e: 'Ortaklar', tur: 'Ortaklar' },
];

export default function MaasGunuAraci({ yontemler, bildir }) {
  const [goster, setGoster] = useState(false);
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState('');
  const [detay, setDetay] = useState(null); // { tur: 'izin' | 'avans', id }
  const [odemeId, setOdemeId] = useState(null);
  const [asgariModal, setAsgariModal] = useState(false);

  const yukle = useCallback(async () => {
    try {
      setVeri(await api('maasGunu', { query: { goster: goster ? '1' : '0' } }));
      setHata('');
    } catch (e) {
      setHata(e.message);
    }
  }, [goster]);
  useEffect(() => {
    yukle();
  }, [yukle]);

  async function ode(payload) {
    await api('avansKaydet', { method: 'POST', body: payload });
    bildir('Maaş ödemesi kaydedildi: personel carisine ödeme makbuzu yazıldı');
    await yukle();
  }

  if (hata && !veri) return <div className="m2-err">{hata}</div>;
  if (!veri) return <div className="m2-card m2-empty">Yükleniyor…</div>;

  const gizli = veri.gizli;
  const para = (v) => (gizli ? GIZLI : TL(v));
  const satirlar = veri.personeller;
  const detayKisi = detay ? satirlar.find((p) => p.id === detay.id) : null;
  const odemeKisi = odemeId ? satirlar.find((p) => p.id === odemeId) : null;
  const t = veri.toplam;
  const asgariSon = veri.asgariListe.length ? veri.asgariListe[veri.asgariListe.length - 1] : null;

  return (
    <>
      <div className="m2-card">
        <div className="m2-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div className="m2-row" style={{ gap: 6 }}>
            <h3 className="tk-baslik" style={{ margin: 0 }}>
              Maaş Günü Aracı
            </h3>
            <button
              type="button"
              className="pkl-goz"
              aria-label="Tutarları göster/gizle"
              title={goster ? 'Gizle' : 'Göster'}
              onClick={() => {
                setDetay(null);
                setOdemeId(null);
                setGoster((v) => !v);
              }}
            >
              {goster ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <button className="m2-btn sec" onClick={() => setAsgariModal(true)}>
            <Settings size={15} style={{ verticalAlign: '-2px', marginRight: 5 }} />
            Asgari Ücret{asgariSon ? `: ${TL(asgariSon.tutar)}` : ''}
          </button>
        </div>
        <p className="m2-hint">
          Toplam Maaş, personel carisindeki tutardır (izin ve avanslar zaten düşülmüştür). Sigortalıda banka payı havale, kalanı nakit ödenir; sigortasızda tamamı nakittir.
          Avanslar: {tarihTR(veri.avansBaslangic)} ve sonrası. İzinler: {donemYazi(veri.izinDonem)}. Bu iki sütun yalnızca bilgidir.
        </p>
        {gizli && <p className="m2-hint">Tutarlar gizli. Görmek ve ödeme yapmak için göz simgesine basın.</p>}
        {veri.asgariListe.length === 0 && <div className="m2-info r">Asgari ücret tanımlı değil: sigortalı personelin havale payı hesaplanamaz. Yukarıdaki Asgari Ücret düğmesinden girin.</div>}

        <div className="m2-table-wrap">
          <table className="m2-table pkl-maas" data-tablo="maas-gunu">
            <thead>
              <tr>
                <th>Personel</th>
                <th className="sayi">Toplam Maaş</th>
                <th className="sayi">İzinler</th>
                <th className="sayi">Avanslar</th>
                <th className="sayi">Ödenecek Nakit</th>
                <th className="sayi">Ödenecek Havale</th>
                <th>Ödeme</th>
              </tr>
            </thead>
            <tbody>
              {satirlar.length === 0 && (
                <tr>
                  <td colSpan={7} className="m2-empty">
                    Listelenecek personel yok.
                  </td>
                </tr>
              )}
              {satirlar.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.adSoyad}</strong>
                    <div className="pkl-maas-alt">
                      {p.gorev || '—'} <span className={`m2-durum ${p.sigortali ? 'g' : 'r'}`}>{p.sigortali ? 'Sigortalı' : 'Sigortasız'}</span>
                    </div>
                  </td>
                  <td className={`sayi ${!gizli && p.cari < 0 ? 'm2-neg' : ''}`}>
                    <strong>{para(p.cari)}</strong>
                  </td>
                  <td className="sayi">
                    {gizli || !p.izinler.length ? (
                      gizli ? GIZLI : '—'
                    ) : (
                      <button type="button" className="pkl-tikla" title="İzin kayıtlarını göster" onClick={() => setDetay({ tur: 'izin', id: p.id })}>
                        {TL(p.izinToplam)} ({p.izinler.length})
                      </button>
                    )}
                  </td>
                  <td className="sayi">
                    {gizli || !p.avanslar.length ? (
                      gizli ? GIZLI : '—'
                    ) : (
                      <button type="button" className="pkl-tikla" title="Avans ve ödeme kayıtlarını göster" onClick={() => setDetay({ tur: 'avans', id: p.id })}>
                        {TL(p.avansToplam)} ({p.avanslar.length})
                      </button>
                    )}
                  </td>
                  <td className="sayi">
                    <strong>{para(p.nakit)}</strong>
                  </td>
                  <td className="sayi" title={!gizli && p.sigortali ? `Banka payı ${TL(p.havaleHakedis)} − havaleyle giden ${TL(p.havaleOdenen)}` : undefined}>
                    <strong>{para(p.havale)}</strong>
                  </td>
                  <td>
                    <button className="m2-btn mini" disabled={gizli} title={gizli ? 'Önce göz simgesiyle tutarları gösterin' : undefined} onClick={() => setOdemeId(p.id)}>
                      Ödeme Yap
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {satirlar.length > 0 && (
              <tfoot>
                <tr>
                  <td>Toplam</td>
                  <td className={`sayi ${!gizli && t.cari < 0 ? 'm2-neg' : ''}`}>{para(t?.cari)}</td>
                  <td className="sayi">{gizli ? GIZLI : TL(satirlar.reduce((x, p) => x + p.izinToplam, 0))}</td>
                  <td className="sayi">{gizli ? GIZLI : TL(satirlar.reduce((x, p) => x + p.avansToplam, 0))}</td>
                  <td className="sayi">{para(t?.nakit)}</td>
                  <td className="sayi">{para(t?.havale)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="pkl-maas-ozet">
          <div>
            <span>Toplam Nakit</span>
            <b>{para(t?.nakit)}</b>
          </div>
          <div>
            <span>Toplam Havale</span>
            <b>{para(t?.havale)}</b>
          </div>
          <div>
            <span>Ödenecek Genel Toplam</span>
            <b>{gizli ? GIZLI : TL((t?.nakit || 0) + (t?.havale || 0))}</b>
          </div>
        </div>
      </div>

      {detayKisi && <DetayModal tur={detay.tur} p={detayKisi} izinDonem={veri.izinDonem} avansBaslangic={veri.avansBaslangic} onKapat={() => setDetay(null)} />}
      {odemeKisi && <OdemeModal p={odemeKisi} bugun={veri.bugun} yontemler={yontemler} onOde={ode} onKapat={() => setOdemeId(null)} />}
      {asgariModal && (
        <AsgariModal
          liste={veri.asgariListe}
          onKaydet={async (liste) => {
            await api('asgariUcretKaydet', { method: 'POST', body: { liste } });
            bildir('Asgari ücret kaydedildi');
            await yukle();
          }}
          onKapat={() => setAsgariModal(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// İzin / avans detayı: tek tek kayıtlar, tarih ve açıklamalarıyla
// ---------------------------------------------------------------------------
function DetayModal({ tur, p, izinDonem, avansBaslangic, onKapat }) {
  const izin = tur === 'izin';
  const kayitlar = izin ? p.izinler : p.avanslar;
  const toplam = izin ? p.izinToplam : p.avansToplam;
  return (
    <ModalKabuk baslik={`${p.adSoyad} — ${izin ? `İzin Kesintileri (${donemYazi(izinDonem)})` : 'Avans ve Ödemeler'}`} onKapat={onKapat} genis>
      <div className="m2-table-wrap">
        <table className="m2-table pkl-dokum">
          <thead>
            <tr>
              <th>Tarih</th>
              {!izin && <th>Ödeme Şekli</th>}
              <th>Açıklama</th>
              <th className="sayi">Tutar</th>
            </tr>
          </thead>
          <tbody>
            {kayitlar.map((k) => (
              <tr key={k.id}>
                <td className="nowrap">{tarihTR(k.tarih)}</td>
                {!izin && (
                  <td>
                    {k.odemeSekli || k.odemeTuru}
                    {k.kasaGrubu === 'gunluk' ? ' (günlük kasa)' : ''}
                  </td>
                )}
                <td>{k.aciklama || '—'}</td>
                <td className="sayi">{TL(k.tutar)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={izin ? 2 : 3}>Toplam</td>
              <td className="sayi">{TL(toplam)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="m2-hint">
        {izin
          ? `${donemYazi(izinDonem)} ayındaki izin kesintileridir. Bilgi amaçlıdır: tutar zaten personel carisinden düşülmüştür.`
          : `${tarihTR(avansBaslangic)} ve sonrasında personele yapılan ödemelerdir (avans ve maaş ödemeleri dahil). Bilgi amaçlıdır: tutar zaten personel carisinden düşülmüştür.`}
      </p>
      <div className="m2-modal-actions">
        <button className="m2-btn sec" onClick={onKapat}>
          Kapat
        </button>
      </div>
    </ModalKabuk>
  );
}

// ---------------------------------------------------------------------------
// Ödeme Yap: yan yana iki form (nakit maaş, havale maaş). Tutar otomatik gelir, değiştirilebilir.
// ---------------------------------------------------------------------------
function OdemeModal({ p, bugun, yontemler, onOde, onKapat }) {
  return (
    <ModalKabuk baslik={`${p.adSoyad} — Maaş Ödemesi`} onKapat={onKapat} genis>
      <div className="pkl-odeme-ozet">
        <span>
          Toplam maaş: <b className={p.cari < 0 ? 'neg' : ''}>{TL(p.cari)}</b>
        </span>
        <span>
          Ödenecek nakit: <b>{TL(p.nakit)}</b>
        </span>
        <span>
          Ödenecek havale: <b>{TL(p.havale)}</b>
        </span>
        <span className={`m2-durum ${p.sigortali ? 'g' : 'r'}`}>{p.sigortali ? 'Sigortalı' : 'Sigortasız'}</span>
      </div>
      <div className="pkl-odeme-grid">
        <OdemeFormu baslik="Nakit Maaş" etiket="nakit" varsayilan={p.nakit} varsayilanYontem="tl" p={p} bugun={bugun} yontemler={yontemler} onOde={onOde} />
        <OdemeFormu
          baslik="Havale Maaş"
          etiket="havale"
          varsayilan={p.havale}
          varsayilanYontem="Banka Havalesi"
          p={p}
          bugun={bugun}
          yontemler={yontemler}
          onOde={onOde}
          not={!p.sigortali ? 'Bu personel sigortasız: havale maaşı yok.' : ''}
        />
      </div>
      <div className="m2-modal-actions">
        <button className="m2-btn sec" onClick={onKapat}>
          Kapat
        </button>
      </div>
    </ModalKabuk>
  );
}

function OdemeFormu({ baslik, etiket, varsayilan, varsayilanYontem, p, bugun, yontemler, onOde, not: bilgiNotu }) {
  const [tutar, setTutar] = useState(varsayilan > 0 ? String(varsayilan) : '');
  const [yk, setYk] = useState(varsayilanYontem);
  const [sekil, setSekil] = useState('');
  const [aciklama, setAciklama] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [hata, setHata] = useState('');
  const kilit = useRef(false); // çift tıklamada aynı ödemenin iki kez yazılmasını engeller
  const y = YONTEMLER.find((x) => x.k === yk);
  const secenekler = y.tur === 'Nakit' ? [] : yontemler.filter((m) => m.odeme_turu === y.tur);
  const kasaAdi = (yontemler.find((m) => m.odeme_turu === 'Nakit') || {}).ad || 'TL Kasa';

  // Ödeme sonrası kalan tutar değişince alan yeni önerilen tutara döner.
  useEffect(() => {
    setTutar(varsayilan > 0 ? String(varsayilan) : '');
  }, [varsayilan]);
  // Tek seçenek varsa (örn. tek banka) otomatik seçilir.
  useEffect(() => {
    setSekil(secenekler.length === 1 ? secenekler[0].ad : '');
  }, [yk, yontemler]); // eslint-disable-line react-hooks/exhaustive-deps

  const gecerli = sayi(tutar) > 0 && (y.tur === 'Nakit' || !!sekil);

  async function ode() {
    if (kilit.current || !gecerli) return;
    kilit.current = true;
    setBekliyor(true);
    setHata('');
    try {
      await onOde({
        personelId: p.id,
        tarih: bugun,
        tutar,
        odemeTuru: y.tur,
        aciklama: `Maaş ödemesi — ${etiket}${aciklama.trim() ? ` — ${aciklama.trim()}` : ''}`,
        ...(y.tur === 'Nakit' ? { kasa: kasaAdi, kasaGrubu: yk === 'gunluk' ? 'gunluk' : 'ana' } : { odemeHesabi: sekil }),
      });
      setAciklama('');
    } catch (e) {
      setHata(e.message);
    } finally {
      kilit.current = false;
      setBekliyor(false);
    }
  }

  return (
    <div className={`pkl-odeme-form ${etiket}`}>
      <h4>{baslik}</h4>
      {bilgiNotu && <p className="m2-hint">{bilgiNotu}</p>}
      <label className="m2-label">Tutar *</label>
      <input className="m2-input" type="number" step="any" aria-label={`${baslik} tutarı`} value={tutar} onChange={(e) => setTutar(e.target.value)} />
      <label className="m2-label">Ödeme Yöntemi</label>
      <div className="m2-chips tight">
        {YONTEMLER.map((m) => (
          <button key={m.k} type="button" className={`m2-chip ${yk === m.k ? 'on' : ''}`} onClick={() => setYk(m.k)}>
            {m.e}
          </button>
        ))}
      </div>
      {y.tur !== 'Nakit' && (
        <>
          <label className="m2-label">{y.tur === 'Banka Havalesi' ? 'Banka' : y.tur === 'Ortaklar' ? 'Ortak' : 'Kart'} *</label>
          <select className="m2-select" aria-label="Ödeme şekli" value={sekil} onChange={(e) => setSekil(e.target.value)}>
            <option value="">— Seçin —</option>
            {secenekler.map((m) => (
              <option key={m.id} value={m.ad}>
                {m.ad}
              </option>
            ))}
          </select>
        </>
      )}
      {yk === 'gunluk' && <p className="m2-hint">Çekmeceden verilir: günlük kasa sayılır, Gün Sonu'nda nakit ciroya geri eklenir.</p>}
      <label className="m2-label">Açıklama (opsiyonel)</label>
      <input className="m2-input" value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
      {hata && <div className="m2-info r">{hata}</div>}
      <button className="m2-btn pkl-odeme-kaydet" disabled={!gecerli || bekliyor} onClick={ode}>
        {bekliyor ? '…' : `${baslik} Öde`}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Asgari ücret geçmişi: her satır "bu aydan itibaren geçerli"
// ---------------------------------------------------------------------------
function AsgariModal({ liste, onKaydet, onKapat }) {
  const [satirlar, setSatirlar] = useState(
    liste.length ? liste.map((x) => ({ donem: x.donem, tutar: String(x.tutar) })) : [{ donem: `${bugunISO().slice(0, 4)}-01`, tutar: '' }],
  );
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onKapat);
  const degistir = (i, alan, deger) => setSatirlar((s) => s.map((x, j) => (j === i ? { ...x, [alan]: deger } : x)));
  const gecerli = satirlar.length > 0 && satirlar.every((x) => /^\d{4}-\d{2}$/.test(x.donem) && sayi(x.tutar) > 0);

  return (
    <ModalKabuk baslik="Asgari Ücret (Banka Maaşı)" onKapat={onKapat}>
      <p className="m2-hint">
        Sigortalı personelin bankadan gidecek maaş payıdır. Her satır, seçilen aydan itibaren geçerlidir. Ocak'ta yeni asgari ücret açıklanınca yeni bir satır ekleyin: geçmiş aylar eski tutarla hesaplanmaya devam eder.
      </p>
      {satirlar.map((s, i) => (
        <div key={i} className="m2-row" style={{ marginBottom: 8, gap: 8 }}>
          <input className="m2-input" type="month" style={{ width: 170 }} aria-label="Geçerli olduğu ay" value={s.donem} onChange={(e) => degistir(i, 'donem', e.target.value)} />
          <input className="m2-input" type="number" step="any" style={{ width: 150 }} aria-label="Asgari ücret tutarı" placeholder="Tutar" value={s.tutar} onChange={(e) => degistir(i, 'tutar', e.target.value)} />
          <button type="button" className="m2-btn sec mini" aria-label="Satırı sil" disabled={satirlar.length === 1} onClick={() => setSatirlar((x) => x.filter((_, j) => j !== i))}>
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="m2-btn sec mini" onClick={() => setSatirlar((x) => [...x, { donem: '', tutar: '' }])}>
        <Plus size={14} style={{ verticalAlign: '-2px', marginRight: 4 }} />
        Satır Ekle
      </button>
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon onKapat={onKapat} devreDisi={!gecerli} bekliyor={bekliyor} onKaydet={() => calistir(satirlar.map((x) => ({ donem: x.donem, tutar: x.tutar })))} />
    </ModalKabuk>
  );
}
