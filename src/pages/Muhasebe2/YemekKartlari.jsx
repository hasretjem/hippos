import { useCallback, useEffect, useState } from 'react';
import { ModalAksiyon, ModalKabuk, TL, api, bugunISO, sayi, tarihTR, useModalKaydet } from './m2Ortak';
import { yemekKartiHesapla } from './yemekKartiHesap';

// ---------------------------------------------------------------------------
// Yemek Kartları (Muhasebe1'deki ekranın aynısı; defter kuralları Muhasebe2'ye göre)
//
//  Fatura kes  -> Ödeme (Tediye) Makbuzu = fatura toplamı  (kart carisi bize borçlu olur)
//              -> Fatura/Fiş = kesinti toplamı (KDV'si ayrı, gider)
//  Para geldi  -> Tahsilat Makbuzu (kart carisine) + banka carisine karşı makbuz
// Her kart ve kesim için ayrı cari vardır: Edenred10, Edenred20, Edenred30 ...
// ---------------------------------------------------------------------------

const KESIMLER = ['10', '20', '30'];
// Türkçe ek: 10'u, 20'si, 30'u / 10'unda, 20'sinde, 30'unda
const kesimAdi = (k) => (String(k) === '20' ? "20'si" : `${k}'u`);
const kesimdeAdi = (k) => (String(k) === '20' ? "20'sinde" : `${k}'unda`);
const donemBugun = () => bugunISO().slice(0, 7);
const yuzde = (oran) => `%${Math.round((oran || 0) * 10000) / 100}`.replace('.', ',');
const gunEkleUI = (iso, n) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) + n * 86400000).toISOString().slice(0, 10);
const kisaTarih = (iso) => (iso ? tarihTR(iso).slice(0, 5) : '');
const kisaAralik = (g) => `${kisaTarih(g.bas)} – ${kisaTarih(g.bit)}`;
function aralikUyariMetni(onceki, uyari) {
  if (!uyari || !onceki) return '';
  const ilk = gunEkleUI(onceki.bit, 1);
  if (uyari.tur === 'bosluk') {
    const son = gunEkleUI(ilk, uyari.gun - 1);
    return `${uyari.gun} gün boşluk var: ${ilk === son ? tarihTR(ilk) : `${tarihTR(ilk)} – ${tarihTR(son)}`} hiçbir faturada yok.`;
  }
  const son = onceki.bit;
  const bas = gunEkleUI(son, -(uyari.gun - 1));
  return `${uyari.gun} gün çakışma var: ${bas === son ? tarihTR(bas) : `${tarihTR(bas)} – ${tarihTR(son)}`} önceki faturada da var.`;
}

export default function YemekKartlariSekmesi({ aktif, bildir, yontemler, onDegisti }) {
  const [donem, setDonem] = useState(donemBugun());
  const [kesim, setKesim] = useState('10');
  const [satirlar, setSatirlar] = useState(null);
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [faturaModal, setFaturaModal] = useState(null);
  const [odemeModal, setOdemeModal] = useState(null);
  const [tanimModal, setTanimModal] = useState(false);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      const j = await api('yemekKarti', { query: { donem, kesim } });
      setSatirlar(j.satirlar || []);
      setHata('');
    } catch (e) {
      setHata(e.message);
    } finally {
      setYukleniyor(false);
    }
  }, [donem, kesim]);

  // Sekme açılınca ve dönem/kesim değişince güncel veri çekilir.
  useEffect(() => {
    if (aktif) yukle();
  }, [aktif, yukle]);

  async function degisti() {
    await yukle();
    await onDegisti?.();
  }

  async function kaydet(payload) {
    const j = await api('yemekKartiKaydet', { method: 'POST', body: payload });
    bildir(
      j.duzenlendi
        ? 'Kesim güncellendi, makbuz ve fatura yeniden yazıldı'
        : 'Fatura kaydedildi: ödeme (tediye) makbuzu ve kesinti faturası otomatik yazıldı',
    );
    await degisti();
  }
  async function sil(kesimId) {
    await api('yemekKartiSil', { method: 'POST', body: { kesimId } });
    bildir('Kesim silindi');
    await degisti();
  }
  async function paraGeldi(payload) {
    await api('yemekKartiParaGeldi', { method: 'POST', body: payload });
    bildir('Para geldi: tahsilat makbuzu otomatik yazıldı');
    await degisti();
  }
  async function paraGeriAl(odemeId) {
    await api('yemekKartiParaGeriAl', { method: 'POST', body: { odemeId } });
    bildir('Para geldi kaydı geri alındı');
    await degisti();
  }
  async function tanimKaydet(payload) {
    await api('yemekKartiTanim', { method: 'POST', body: payload });
    bildir('Kart tanımı kaydedildi');
    await yukle();
  }

  const liste = satirlar || [];
  const toplamKesinti = liste.reduce((x, s) => x + (s.kesim ? s.kesim.kesintiToplami : 0), 0);
  const toplamYatacak = liste.reduce((x, s) => x + (s.kesim ? s.kesim.bankayaYatacak : 0), 0);

  return (
    <div className="m2-card">
      <div className="m2-row m2-yk-ust">
        <h2 style={{ margin: 0 }}>Yemek Kartları</h2>
        <strong>Dönem:</strong>
        <input type="month" className="m2-input" style={{ width: 170 }} value={donem} onChange={(e) => setDonem(e.target.value)} />
        <strong>Kesim:</strong>
        <div className="m2-chips">
          {KESIMLER.map((k) => (
            <button key={k} type="button" className={`m2-chip ${kesim === k ? 'on' : ''}`} onClick={() => setKesim(k)}>
              Ayın {kesimAdi(k)}
            </button>
          ))}
        </div>
        <button className="m2-btn sec mini" style={{ marginLeft: 'auto' }} onClick={() => setTanimModal(true)}>
          Kart Tanımları
        </button>
      </div>

      {hata && <div className="m2-info r">{hata}</div>}

      <div className="m2-table-wrap" style={{ marginTop: 12 }}>
        <table className="m2-table m2-yk">
          <thead>
            <tr>
              <th>Firma</th>
              <th>Fatura Tarihi</th>
              <th className="sayi">Matrah</th>
              <th className="sayi">KDV</th>
              <th className="sayi">Fatura Toplamı</th>
              <th>Vade</th>
              <th>Oran</th>
              <th className="sayi">Kesinti Toplamı</th>
              <th className="sayi">Bankaya Yatacak</th>
              <th className="sayi">Günsonu Toplamı</th>
              <th>Fark</th>
              <th>Gelen</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {satirlar === null && !hata && (
              <tr>
                <td colSpan={13} className="m2-empty">
                  Yükleniyor…
                </td>
              </tr>
            )}
            {liste.map((s) => {
              const k = s.kesim;
              const gunsonuUyumsuz = k && Math.abs(s.gunsonuFark) > 1;
              const kilitli = s.odemeler.length > 0;
              return (
                <tr
                  key={s.kart.id}
                  className={!s.kesilirMi ? 'yk-kirmizi' : ''}
                  title={!s.kesilirMi ? 'Bu kartı bu kesimde normalde kesmiyorsunuz — yine de girebilirsiniz' : undefined}
                >
                  <td>
                    <strong>{s.kart.ad}</strong>
                    {s.cari && <span className="m2-sub">{s.cari.ad}</span>}
                  </td>
                  <td className="nowrap">{k ? tarihTR(k.faturaTarihi) : '—'}</td>
                  <td className="sayi">{k ? TL(k.matrah) : '—'}</td>
                  <td className="sayi">{k ? TL(k.kdv) : '—'}</td>
                  <td className="sayi">{k ? TL(k.faturaToplami) : '—'}</td>
                  <td className="nowrap">{k && k.vade ? tarihTR(k.vade) : '—'}</td>
                  <td>{yuzde(s.kart.komisyonOrani)}</td>
                  <td className="sayi">{k ? TL(k.kesintiToplami) : '—'}</td>
                  <td className="sayi">
                    <strong>{k ? TL(k.bankayaYatacak) : '—'}</strong>
                  </td>
                  <td className="sayi">
                    {TL(s.gunsonuToplam)}
                    <span className={`m2-sub ${s.gunsonu.uyari ? 'm2-txt-r' : ''}`}>
                      {kisaAralik(s.gunsonu)}
                      {s.gunsonu.oneri ? ' (öneri)' : ''}
                      {s.gunsonu.uyari ? ` • ${s.gunsonu.uyari.gun} gün ${s.gunsonu.uyari.tur === 'bosluk' ? 'boşluk' : 'çakışma'}` : ''}
                      {!s.gunsonu.oneri && s.gunsonu.eksikGunSayisi > 0 ? ` • ${s.gunsonu.eksikGunSayisi} gün kayıt yok` : ''}
                    </span>
                  </td>
                  <td>
                    {k ? (
                      <span className={`m2-durum ${gunsonuUyumsuz ? 'r' : 'g'}`}>
                        {gunsonuUyumsuz ? TL(s.gunsonuFark) : 'Uyumlu'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {k && s.gelenToplam > 0 ? (
                      <span
                        className={`m2-durum ${s.kalan > 0.005 || s.kalan < -0.005 ? 'r' : 'g'}`}
                        title={s.vadeFarkliMi ? `Vade ${tarihTR(k.vade)}, son gelen ${tarihTR(s.odemeler[s.odemeler.length - 1].gelisTarihi)}` : undefined}
                      >
                        {TL(s.gelenToplam)}
                        {Math.abs(s.kalan) > 0.005 ? ` (kalan ${TL(s.kalan)})` : ''}
                        {s.vadeFarkliMi ? ' • vade farklı' : ''}
                      </span>
                    ) : k && s.vadeGecti ? (
                      <span className="m2-durum r">Vade geçti</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="m2-yk-islem">
                      <button className="m2-btn sec mini" onClick={() => setFaturaModal(s)}>
                        {k ? 'Düzenle' : 'Fatura Kes'}
                      </button>
                      {k && (
                        <button className="m2-btn sec mini" onClick={() => setOdemeModal(s)}>
                          Para Geldi
                        </button>
                      )}
                      {k && kilitli && <span className="m2-hint" style={{ margin: 0 }}>kilitli</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>Toplam</td>
              <td className="sayi">{TL(toplamKesinti)}</td>
              <td className="sayi">{TL(toplamYatacak)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="m2-hint">
        Kırmızı satırlar bu kesimde normalde fatura kesmediğiniz kartlardır; gerekirse yine de girebilirsiniz. Kesinti tutarı "Yemek
        Kart-Banka Masrafı" kategorisinde fatura/fiş olarak, fatura toplamı ödeme (tediye) makbuzu olarak otomatik yazılır; kart
        carisi (örn. Edenred10) bize borçlu olur. Para geldiğinde tahsilat makbuzu kesilir.
      </p>

      {faturaModal && (
        <FaturaModal
          satir={faturaModal}
          donem={donem}
          kesim={kesim}
          onKaydet={kaydet}
          onSil={sil}
          onBitti={() => setFaturaModal(null)}
          onKapat={() => setFaturaModal(null)}
        />
      )}
      {odemeModal && (
        <ParaGeldiModal
          satir={odemeModal}
          bankalar={(yontemler || []).filter((y) => y.odeme_turu === 'Banka Havalesi')}
          onKaydet={paraGeldi}
          onGeriAl={paraGeriAl}
          onBitti={() => setOdemeModal(null)}
          onKapat={() => setOdemeModal(null)}
        />
      )}
      {tanimModal && <TanimModal satirlar={liste} onKaydet={tanimKaydet} onKapat={() => setTanimModal(false)} />}
    </div>
  );
}

// --------------------------- Fatura kesimi ---------------------------------
function FaturaModal({ satir, donem, kesim, onKaydet, onSil, onBitti, onKapat }) {
  const k = satir.kesim;
  const kart = satir.kart;
  const [faturaTarihi, setFaturaTarihi] = useState(k ? k.faturaTarihi : bugunISO());
  const [matrah, setMatrah] = useState(k ? String(k.matrah) : '');
  const [vade, setVade] = useState(k ? k.vade : '');
  // Günsonu aralığı (başlangıç ve bitiş DAHİL): elle değiştirilene kadar öneriyi izler.
  // Bitiş = fatura tarihi, başlangıç = aynı kartın önceki kesiminin bitişi + 1 gün.
  const [bas, setBas] = useState(k ? k.gunsonuBas : '');
  const [bit, setBit] = useState(k ? k.gunsonuBit : '');
  const [basEl, setBasEl] = useState(!!k);
  const [bitEl, setBitEl] = useState(!!k);
  const [on, setOn] = useState(null);
  const [onHata, setOnHata] = useState('');
  const [silBekliyor, setSilBekliyor] = useState(false);
  const [silHata, setSilHata] = useState('');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);
  const kilitli = !!k && satir.odemeler.length > 0;

  useEffect(() => {
    let iptal = false;
    const zamanlayici = setTimeout(async () => {
      try {
        const query = { kartId: kart.id, donem, kesim, faturaTarihi };
        if (basEl && bas) query.bas = bas;
        if (bitEl && bit) query.bit = bit;
        const j = await api('yemekKartiOnizleme', { query });
        if (iptal) return;
        setOn(j);
        setOnHata('');
        if (!basEl) setBas(j.bas);
        if (!bitEl) setBit(j.bit);
      } catch (e) {
        if (!iptal) {
          setOn(null);
          setOnHata(e.message);
        }
      }
    }, 150);
    return () => {
      iptal = true;
      clearTimeout(zamanlayici);
    };
    // bas/bit yalnızca elle değiştirildiyse sorguyu tetikler (öneriyi izlerken döngü olmasın)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faturaTarihi, basEl ? bas : '', bitEl ? bit : '', basEl, bitEl]);

  // Canlı önizleme — sunucudaki hesapla birebir aynı formül.
  const m = sayi(matrah);
  const h = yemekKartiHesapla(m, kart);
  const gunsonuToplam = on ? on.toplam : satir.gunsonuToplam;
  const gunsonuFark = Math.round((h.faturaToplami - gunsonuToplam) * 100) / 100;

  async function sil() {
    if (!window.confirm('Bu kesim silinsin mi? Otomatik yazılan ödeme (tediye) makbuzu ve kesinti faturası da silinir.')) return;
    setSilBekliyor(true);
    setSilHata('');
    try {
      await onSil(k.id);
      onBitti();
    } catch (e) {
      setSilHata(e.message);
      setSilBekliyor(false);
    }
  }

  return (
    <ModalKabuk baslik={`${kart.ad} — Fatura Kesimi`} onKapat={onKapat}>
      {!satir.kesilirMi && (
        <p className="m2-hint m2-txt-r">
          Bu kartı ayın {kesimdeAdi(kesim)} normalde kesmiyorsunuz. Yine de kesebilirsiniz.
        </p>
      )}
      {kilitli && (
        <div className="m2-info r">
          Bu kesim için para geldi kaydı var. Düzenlemek veya silmek için önce Para Geldi penceresinden kayıtları geri alın.
        </div>
      )}
      <label className="m2-label">Fatura Tarihi</label>
      <input className="m2-input" type="date" value={faturaTarihi} disabled={kilitli} onChange={(e) => setFaturaTarihi(e.target.value)} />
      <label className="m2-label">Fatura Matrahı (KDV hariç) *</label>
      <input className="m2-input" type="number" step="any" value={matrah} disabled={kilitli} onChange={(e) => setMatrah(e.target.value)} />
      <label className="m2-label">Vade (paranın geleceği tarih)</label>
      <input className="m2-input" type="date" value={vade || ''} disabled={kilitli} onChange={(e) => setVade(e.target.value)} />
      <label className="m2-label">Günsonu aralığı (başlangıç ve bitiş günü dahil)</label>
      <div className="m2-row">
        <input
          className="m2-input"
          type="date"
          aria-label="Günsonu başlangıç"
          value={bas}
          disabled={kilitli}
          onChange={(e) => {
            setBas(e.target.value);
            setBasEl(true);
          }}
        />
        <span>–</span>
        <input
          className="m2-input"
          type="date"
          aria-label="Günsonu bitiş"
          value={bit}
          disabled={kilitli}
          onChange={(e) => {
            setBit(e.target.value);
            setBitEl(true);
          }}
        />
      </div>
      {on && on.onceki && (
        <p className="m2-not">
          Önceki kesim ({kart.ad}, {on.onceki.donem} / {on.onceki.kesim}) {tarihTR(on.onceki.bit)} günü bitti; bu aralık {tarihTR(on.oneriBas)} gününden başlamalı.
        </p>
      )}
      {on && on.onceKesimYok && <p className="m2-not">Bu kart için önceki kesim girilmemiş: standart başlangıç kullanıldı.</p>}
      {on && on.uyari && <p className="m2-txt-r m2-not">{aralikUyariMetni(on.onceki, on.uyari)}</p>}
      {((basEl && on && bas !== on.oneriBas) || (bitEl && on && bit !== on.oneriBit && bit !== faturaTarihi)) && on && (
        <button type="button" className="m2-link" onClick={() => { setBasEl(false); setBitEl(false); }}>
          Önerilen aralığa dön
        </button>
      )}

      <div className="m2-kutu">
        <table className="m2-table m2-onizleme">
          <tbody>
            <tr>
              <td>Faturamızın KDV'si ({yuzde(kart.faturaKdv || 0.1)})</td>
              <td className="sayi">{TL(h.kdv)}</td>
            </tr>
            <tr>
              <td>Fatura Toplamı</td>
              <td className="sayi">
                <strong>{TL(h.faturaToplami)}</strong>
              </td>
            </tr>
            <tr>
              <td>Kesinti Matrahı ({yuzde(kart.komisyonOrani)})</td>
              <td className="sayi">{TL(h.kesintiMatrah)}</td>
            </tr>
            <tr>
              <td>Kesinti KDV'si</td>
              <td className="sayi">{TL(h.kesintiKdv)}</td>
            </tr>
            <tr>
              <td>Kesinti Toplamı (fatura/fiş olarak yazılacak)</td>
              <td className="sayi">{TL(h.kesintiToplami)}</td>
            </tr>
            <tr>
              <td>Bankaya Yatacak Tutarımız</td>
              <td className="sayi">
                <strong>{TL(h.bankayaYatacak)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="m2-kutu">
        {onHata && <p className="m2-txt-r" style={{ margin: 0 }}>{onHata}</p>}
        {on && (
          <>
            <div className="m2-gun-liste">
              {on.gunler.map((g) => (
                <div key={g.tarih} className={`m2-gun ${g.kayit ? '' : 'yok'}`}>
                  <span>{tarihTR(g.tarih)}</span>
                  <span>{g.kayit ? TL(g.toplam) : 'günsonu kaydı yok'}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: 0 }}>
              Günsonu toplamı ({on.gunler.length} gün): <strong>{TL(on.toplam)}</strong>
            </p>
            {on.eksikGunler.length > 0 && (
              <p className="m2-txt-r" style={{ margin: '6px 0 0' }}>
                {on.eksikGunler.length} gün için günsonu kaydı yok
                {on.eksikGunler.length <= 4 ? `: ${on.eksikGunler.map((g) => kisaTarih(g)).join(', ')}` : ''}.
              </p>
            )}
            {m > 0 &&
              (Math.abs(gunsonuFark) > 1 ? (
                <p className="m2-txt-r" style={{ margin: '6px 0 0' }}>Fatura toplamı ile günsonu arasında {TL(gunsonuFark)} fark var.</p>
              ) : (
                <p className="m2-txt-g" style={{ margin: '6px 0 0' }}>Günsonu toplamıyla uyumlu.</p>
              ))}
          </>
        )}
      </div>

      {m > 0 && (
        <div className="m2-info">
          Kaydedince otomatik yazılır: <strong>{satir.cari ? satir.cari.ad : kart.ad}</strong> için Ödeme (Tediye) Makbuzu{' '}
          {TL(h.faturaToplami)}
          {h.kesintiToplami > 0 ? ` ve Fatura/Fiş ${TL(h.kesintiToplami)} (KDV ${TL(h.kesintiKdv)})` : ''}. Cari bize {TL(h.bankayaYatacak)} borçlu
          olur.
        </div>
      )}

      {(hata || silHata) && <div className="m2-info r">{hata || silHata}</div>}

      <div className="m2-modal-actions" style={{ justifyContent: k ? 'space-between' : 'flex-end' }}>
        {k && (
          <button className="m2-btn sec" disabled={kilitli || silBekliyor} onClick={sil}>
            {silBekliyor ? '…' : 'Sil'}
          </button>
        )}
        <div className="m2-row">
          <button className="m2-btn sec" onClick={onKapat}>
            Vazgeç
          </button>
          <button
            className="m2-btn"
            disabled={bekliyor || kilitli || !(m > 0) || !!onHata || !bas || !bit}
            onClick={() => calistir({ kartId: kart.id, donem, kesim, faturaTarihi, matrah, vade, gunsonuBas: bas, gunsonuBit: bit })}
          >
            {bekliyor ? '…' : 'Kaydet'}
          </button>
        </div>
      </div>
    </ModalKabuk>
  );
}

// ------------------------------ Para geldi ---------------------------------
function ParaGeldiModal({ satir, bankalar, onKaydet, onGeriAl, onBitti, onKapat }) {
  const k = satir.kesim;
  const baslangicTutar = satir.kalan > 0.005 ? satir.kalan : k.bankayaYatacak;
  const [gelenTutar, setGelenTutar] = useState(String(baslangicTutar));
  const [gelisTarihi, setGelisTarihi] = useState(bugunISO());
  const [hesapAdi, setHesapAdi] = useState('');
  const [geriHata, setGeriHata] = useState('');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);

  const gelen = sayi(gelenTutar);
  const fark = Math.round((satir.kalan - gelen) * 100) / 100;
  const vadeFarkli = k.vade && gelisTarihi !== k.vade;

  async function geriAl(odeme) {
    if (!window.confirm(`${TL(odeme.tutar)} tutarındaki para geldi kaydı geri alınsın mı? Tahsilat ve banka makbuzları silinir.`)) return;
    setGeriHata('');
    try {
      await onGeriAl(odeme.id);
      onBitti();
    } catch (e) {
      setGeriHata(e.message);
    }
  }

  return (
    <ModalKabuk baslik={`${satir.kart.ad} — Para Geldi`} onKapat={onKapat}>
      <p className="m2-hint">
        Bankaya yatacak: {TL(k.bankayaYatacak)} — kalan: {TL(satir.kalan)} — vade {k.vade ? tarihTR(k.vade) : 'girilmemiş'}
      </p>

      {satir.odemeler.length > 0 && (
        <div className="m2-kutu">
          <strong>Daha önce gelenler</strong>
          {satir.odemeler.map((o) => (
            <div key={o.id} className="m2-row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
              <span>
                {tarihTR(o.gelisTarihi)} • {o.hesapAdi} • <strong>{TL(o.tutar)}</strong>
              </span>
              <button className="m2-btn sec mini" onClick={() => geriAl(o)}>
                Geri Al
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="m2-label">Gelen Tutar *</label>
      <input className="m2-input" type="number" step="any" value={gelenTutar} onChange={(e) => setGelenTutar(e.target.value)} />
      <label className="m2-label">Geliş Tarihi</label>
      <input className="m2-input" type="date" value={gelisTarihi} onChange={(e) => setGelisTarihi(e.target.value)} />
      <label className="m2-label">Hangi Hesaba Geldi</label>
      <select className="m2-select" value={hesapAdi} onChange={(e) => setHesapAdi(e.target.value)}>
        <option value="">— Seçin —</option>
        {bankalar.map((b) => (
          <option key={b.id} value={b.ad}>
            {b.ad}
          </option>
        ))}
      </select>

      <div className="m2-kutu">
        {Math.abs(fark) < 0.005 ? (
          <p className="m2-txt-g" style={{ margin: 0 }}>Tutarlar uyumlu: kalan borç sıfırlanacak.</p>
        ) : Math.abs(fark) <= 1 ? (
          <p className="m2-txt-r" style={{ margin: 0 }}>Küsurat farkı: {TL(fark)} — cari kartında küçük bir bakiye kalır.</p>
        ) : (
          <p className="m2-txt-r" style={{ margin: 0 }}>{TL(fark)} fark var — eksik ya da fazla yatmış olabilir.</p>
        )}
        {vadeFarkli && (
          <p className="m2-txt-r" style={{ margin: '6px 0 0' }}>
            Vade {tarihTR(k.vade)} idi, para {tarihTR(gelisTarihi)} tarihinde gelmiş.
          </p>
        )}
      </div>
      <p className="m2-hint">Kaydedince {satir.cari ? satir.cari.ad : 'kart'} carisine Tahsilat Makbuzu, seçilen hesaba karşı makbuz otomatik yazılır.</p>

      {(hata || geriHata) && <div className="m2-info r">{hata || geriHata}</div>}
      <ModalAksiyon
        onKapat={onKapat}
        devreDisi={!(gelen > 0) || !hesapAdi}
        bekliyor={bekliyor}
        onKaydet={() => calistir({ kesimId: k.id, gelenTutar, gelisTarihi, hesapAdi })}
      />
    </ModalKabuk>
  );
}

// ---------------------------- Kart tanımları -------------------------------
function TanimModal({ satirlar, onKaydet, onKapat }) {
  const [duzenlenen, setDuzenlenen] = useState(null);
  const [hata, setHata] = useState('');

  async function kaydet(k) {
    setHata('');
    try {
      await onKaydet({ id: k.id, komisyonOrani: k.komisyonOrani, kesim10: k.kesim10, kesim20: k.kesim20, kesim30: k.kesim30 });
      setDuzenlenen(null);
    } catch (e) {
      setHata(e.message);
    }
  }

  return (
    <ModalKabuk baslik="Yemek Kartı Tanımları" onKapat={onKapat} genis>
      <div className="m2-table-wrap" style={{ marginTop: 10 }}>
        <table className="m2-table" style={{ minWidth: 520 }}>
          <thead>
            <tr>
              <th>Kart</th>
              <th>Komisyon</th>
              <th>10'u</th>
              <th>20'si</th>
              <th>30'u</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {satirlar.map((s) => {
              const duzenlemede = !!(duzenlenen && duzenlenen.id === s.kart.id);
              const k = duzenlemede ? duzenlenen : s.kart;
              return (
                <tr key={k.id}>
                  <td>{k.ad}</td>
                  <td>
                    {duzenlemede ? (
                      <input
                        className="m2-input"
                        style={{ width: 90, height: 34 }}
                        type="number"
                        step="0.01"
                        value={k.komisyonOrani}
                        onChange={(e) => setDuzenlenen({ ...k, komisyonOrani: e.target.value })}
                      />
                    ) : (
                      yuzde(k.komisyonOrani)
                    )}
                  </td>
                  {['kesim10', 'kesim20', 'kesim30'].map((alan) => (
                    <td key={alan}>
                      <input
                        type="checkbox"
                        checked={!!k[alan]}
                        disabled={!duzenlemede}
                        onChange={(e) => setDuzenlenen({ ...k, [alan]: e.target.checked })}
                      />
                    </td>
                  ))}
                  <td>
                    {duzenlemede ? (
                      <button className="m2-btn mini" onClick={() => kaydet(k)}>
                        Kaydet
                      </button>
                    ) : (
                      <button className="m2-btn sec mini" onClick={() => setDuzenlenen({ ...s.kart })}>
                        Düzenle
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hata && <div className="m2-info r">{hata}</div>}
      <p className="m2-hint">
        Komisyon oranını ondalık girin: %6 için 0,06 — %8 için 0,08. Oran değişince daha önce kesilmiş kesimler değişmez, yalnızca
        yeni kesimler yeni oranla hesaplanır.
      </p>
    </ModalKabuk>
  );
}