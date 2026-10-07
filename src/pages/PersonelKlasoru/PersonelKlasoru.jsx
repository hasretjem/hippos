import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff, Plus } from 'lucide-react';
import { CekmeceKutusu, ModalAksiyon, ModalKabuk, TL, api, bugunISO, sayi, tarihTR, trNorm, useModalKaydet } from '../Muhasebe2/m2Ortak';
import '../Muhasebe2/Muhasebe2.css';
import './PersonelKlasoru.css';

// ---------------------------------------------------------------------------
// Personel Klasörü: çalışan ve çalışmayan personelin bilgileri, puantajı, izin ve avansları.
// Maaş ve notlar varsayılan olarak GİZLİDİR (göz butonu). Gizliyken sunucu bu verileri hiç göndermez.
// Maaş tahakkuku Muhasebe2 > Tahakkuklar sekmesinde yapılır.
// ---------------------------------------------------------------------------

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUN_KISA = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
const GIZLI = '••••••';
const donemYazi = (d) => `${AYLAR[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const ayEkle = (donem, n) => {
  const [y, a] = donem.split('-').map(Number);
  const t = y * 12 + (a - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const haftaGunu = (iso) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))).getUTCDay();
const hucreYazi = (d) => (d === null ? '—' : d === 0.5 ? '0,5' : String(d));
const zamanTR = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${tarihTR(d.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' }))} ${d.toLocaleTimeString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' })}`;
};

export default function PersonelKlasoru({ onNavigate }) {
  const [liste, setListe] = useState(null);
  const [hata, setHata] = useState('');
  const [ara, setAra] = useState('');
  const [filtre, setFiltre] = useState('aktif'); // aktif | pasif | tumu
  const [secili, setSecili] = useState(null);
  const [formModal, setFormModal] = useState(false);
  const [yontemler, setYontemler] = useState([]);
  const [toast, setToast] = useState(null);
  const zamanlayici = useRef(null);

  const bildir = useCallback((mesaj, hataMi = false) => {
    setToast({ mesaj, hata: hataMi });
    clearTimeout(zamanlayici.current);
    zamanlayici.current = setTimeout(() => setToast(null), hataMi ? 5000 : 3000);
  }, []);

  const yukle = useCallback(async () => {
    try {
      const j = await api('personelListe');
      setListe(j.personeller || []);
      setHata('');
    } catch (e) {
      setHata(e.message);
    }
  }, []);
  useEffect(() => {
    yukle();
    api('baslangic')
      .then((j) => setYontemler(j.odemeYontemleri || []))
      .catch(() => {});
  }, [yukle]);

  async function personelKaydet(payload) {
    const j = await api('personelKaydet', { method: 'POST', body: payload });
    bildir('Personel kaydedildi');
    await yukle();
    return j;
  }

  const gorunen = (liste || []).filter((p) => {
    if (filtre === 'aktif' && !p.aktif) return false;
    if (filtre === 'pasif' && p.aktif) return false;
    const q = trNorm(ara);
    return !q || trNorm(`${p.adSoyad} ${p.gorev}`).includes(q);
  });

  return (
    <div className="m2-shell pkl-shell">
      <button className="m2-back" onClick={() => (secili ? setSecili(null) : onNavigate ? onNavigate('settings') : (window.location.href = '/'))}>
        <ArrowLeft size={16} /> {secili ? 'Personel listesi' : 'Geri'}
      </button>
      <h1 className="m2-title">Personel Klasörü</h1>
      {hata && <div className="m2-err">{hata}</div>}

      {!secili && (
        <div className="m2-card">
          <div className="m2-toolbar" style={{ marginTop: 0 }}>
            <input className="m2-input m2-ara" style={{ width: 220 }} placeholder="Personel ara…" value={ara} onChange={(e) => setAra(e.target.value)} />
            <div className="m2-chips tight">
              {[
                ['aktif', 'Aktif'],
                ['pasif', 'Pasif'],
                ['tumu', 'Tümü'],
              ].map(([k, e]) => (
                <button key={k} type="button" className={`m2-chip ${filtre === k ? 'on' : ''}`} onClick={() => setFiltre(k)}>
                  {e}
                </button>
              ))}
            </div>
            <button className="m2-btn" style={{ marginLeft: 'auto' }} onClick={() => setFormModal(true)}>
              <Plus size={15} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Yeni Personel
            </button>
          </div>
          {liste && gorunen.length === 0 && <div className="m2-empty">Bu filtreye uyan personel yok.</div>}
          <div className="pkl-grid">
            {gorunen.map((p) => (
              <button key={p.id} type="button" className={`pkl-kart ${p.aktif ? '' : 'pasif'}`} onClick={() => setSecili(p.id)}>
                <span className="pkl-kart-ad">{p.adSoyad}</span>
                <span className="pkl-kart-gorev">{p.gorev || '—'}</span>
                <span className={`pkl-durum ${p.aktif ? 'aktif' : 'pasif'}`}>{p.aktif ? 'Aktif' : 'Pasif'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {secili && <PersonelDetay key={secili} id={secili} bildir={bildir} yontemler={yontemler} onDegisti={yukle} />}

      {formModal && <PersonelFormModal onKaydet={personelKaydet} onBitti={() => setFormModal(false)} onKapat={() => setFormModal(false)} />}
      {toast && <div className={`m2-toast ${toast.hata ? 'hata' : ''}`}>{toast.mesaj}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Personel detayı
// ---------------------------------------------------------------------------
function PersonelDetay({ id, bildir, yontemler, onDegisti }) {
  const [donem, setDonem] = useState(bugunISO().slice(0, 7));
  const [goster, setGoster] = useState(false); // göz: maaş + notlar + parasal değerler
  const [veri, setVeri] = useState(null);
  const [dokum, setDokum] = useState(null); // Hakediş Dökümü: yalnızca göz açıkken istenir
  const [hata, setHata] = useState('');
  const [secGun, setSecGun] = useState('');
  const [izinModal, setIzinModal] = useState(null); // {tarih} yeni | {kayit} düzenle
  const [avansModal, setAvansModal] = useState(null);
  const [notModal, setNotModal] = useState(false);
  const [formModal, setFormModal] = useState(false);

  const yukle = useCallback(async () => {
    try {
      setVeri(await api('personelDetay', { query: { id, donem, goster: goster ? '1' : '0' } }));
      // Hakediş Dökümü maaş bilgisi içerir: göz kapalıyken sunucudan hiç istenmez.
      setDokum(goster ? await api('personelDokum', { query: { id, goster: '1' } }) : null);
      setHata('');
    } catch (e) {
      setHata(e.message);
    }
  }, [id, donem, goster]);
  useEffect(() => {
    yukle();
  }, [yukle]);

  async function islem(fn, mesaj) {
    try {
      await fn();
      if (mesaj) bildir(mesaj);
      await yukle();
      await onDegisti?.();
    } catch (e) {
      bildir(e.message, true);
    }
  }

  if (hata && !veri) return <div className="m2-err">{hata}</div>;
  if (!veri) return <div className="m2-card m2-empty">Yükleniyor…</div>;
  const p = veri.personel;
  const pt = veri.puantaj;
  const para = (v) => (!goster ? GIZLI : v === undefined ? '…' : TL(v));
  const kilit = veri.kilitli;

  const goz = (
    <button type="button" className="pkl-goz" aria-label="Maaş ve notları göster/gizle" title={goster ? 'Gizle' : 'Göster'} onClick={() => setGoster((v) => !v)}>
      {goster ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <>
      <div className="m2-card">
        <div className="m2-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ margin: 0 }}>{p.adSoyad}</h2>
            <div className="pkl-alt">
              {p.gorev || '—'} • <span className={`pkl-durum ${p.aktif ? 'aktif' : 'pasif'}`}>{p.aktif ? 'Aktif' : 'Pasif'}</span>
            </div>
          </div>
          <button className="m2-btn sec" onClick={() => setFormModal(true)}>
            Bilgileri Düzenle
          </button>
        </div>

        <div className="pkl-bilgi">
          <div className="pkl-alan">
            <span>Maaş</span>
            <b data-alan="maas">
              {goster ? TL(p.maas) : GIZLI} {goz}
            </b>
          </div>
          <div className="pkl-alan">
            <span>İşe Giriş</span>
            <b>{tarihTR(p.iseGiris)}</b>
          </div>
          <div className="pkl-alan">
            <span>SGK Başlama</span>
            <b>{p.sgkYok ? 'Yok' : p.sgkBaslama ? tarihTR(p.sgkBaslama) : '—'}</b>
          </div>
          <div className="pkl-alan">
            <span>Çıkış</span>
            <b>
              {p.cikisTarihi ? tarihTR(p.cikisTarihi) : '—'}
              {p.cikisTarihi && p.cikisSebebi && <i className="pkl-sebep"> ({p.cikisSebebi})</i>}
            </b>
          </div>
          <div className="pkl-alan">
            <span>Telefon</span>
            <b>{p.telefon || '—'}</b>
          </div>
          <div className="pkl-alan genis">
            <span>İkametgâh Adresi</span>
            <b>{p.adres || '—'}</b>
          </div>
        </div>

        <div className="pkl-notlar">
          <div className="m2-row" style={{ justifyContent: 'space-between' }}>
            <h3 className="tk-baslik" style={{ margin: 0 }}>
              Personel Notları
            </h3>
            <div className="m2-row">
              <button className="m2-btn sec mini" onClick={() => setNotModal(true)}>
                + Not Ekle
              </button>
              {goz}
            </div>
          </div>
          {!goster && <p className="m2-hint">Notlar gizli. Görmek için göz simgesine basın.</p>}
          {goster && veri.notlar && veri.notlar.length === 0 && <p className="m2-hint">Henüz not yok.</p>}
          {goster &&
            veri.notlar &&
            veri.notlar.map((n) => (
              <div key={n.id} className="pkl-not">
                <span className="pkl-not-tarih">{zamanTR(n.tarih)}</span>
                <span style={{ flex: 1 }}>{n.metin}</span>
                <button
                  type="button"
                  className="m2-btn sec mini"
                  onClick={() => window.confirm('Bu not silinsin mi?') && islem(() => api('notSil', { method: 'POST', body: { id: n.id } }), 'Not silindi')}
                >
                  Sil
                </button>
              </div>
            ))}
        </div>
      </div>

      <div className="m2-card">
        <div className="m2-row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <h3 className="tk-baslik" style={{ margin: 0 }}>
            Puantaj
          </h3>
          <button className="m2-btn sec mini" aria-label="Önceki ay" onClick={() => setDonem(ayEkle(donem, -1))}>
            <ChevronLeft size={14} />
          </button>
          <input className="m2-input" type="month" style={{ width: 170 }} value={donem} onChange={(e) => e.target.value && setDonem(e.target.value)} />
          <button className="m2-btn sec mini" aria-label="Sonraki ay" onClick={() => setDonem(ayEkle(donem, 1))}>
            <ChevronRight size={14} />
          </button>
          <span className="m2-hint" style={{ margin: 0 }}>
            {donemYazi(donem)} — {pt.gunler.length} gün
          </span>
          {kilit && <span className="m2-durum r">Tahakkuk edildi ({tarihTR(veri.tahakkukTarihi)}): izin kaydı değiştirilemez</span>}
        </div>

        <div className="m2-table-wrap">
          <table className="pkl-puantaj">
            <thead>
              <tr>
                {pt.gunler.map((g) => (
                  <th key={g.tarih} className={[0, 6].includes(haftaGunu(g.tarih)) ? 'hs' : ''}>
                    {Number(g.tarih.slice(8, 10))}
                    <small>{GUN_KISA[haftaGunu(g.tarih)]}</small>
                  </th>
                ))}
                <th className="top">Toplam Gün</th>
                <th className="top">Toplam Maaş</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {pt.gunler.map((g) => (
                  <td
                    key={g.tarih}
                    data-tarih={g.tarih}
                    className={['hucre', [0, 6].includes(haftaGunu(g.tarih)) ? 'hs' : '', g.izin ? 'izin' : '', g.deger === null ? 'bos' : '', secGun === g.tarih ? 'sec' : ''].join(' ')}
                    onClick={() => g.deger !== null && setSecGun(secGun === g.tarih ? '' : g.tarih)}
                    title={g.izin ? (g.izin === 'Yarım' ? 'Yarım gün izin' : 'İzinli') : undefined}
                  >
                    {hucreYazi(g.deger)}
                  </td>
                ))}
                <td className="top" data-alan="toplamGun">
                  {String(pt.toplamGun).replace('.', ',')}
                </td>
                <td className="top" data-alan="toplamMaas">
                  {para(pt.net)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="m2-hint" data-alan="ozet">
          Çalışılan {pt.calisilanGun} gün • Ücretli {pt.ucretliGun} gün{pt.tamAy ? ' (tam ay: 30 gün esası)' : ''} • İzin {String(pt.izinGun).replace('.', ',')} gün • Brüt {para(pt.brut)} • Kesinti {para(pt.kesinti)} •{' '}
          <strong>Net {para(pt.net)}</strong>. Günlük maaş her ay maaş ÷ 30'dur.
        </p>

        {secGun && (
          <div className="m2-kutu pkl-gunmenu">
            <strong>{tarihTR(secGun)}</strong> için:
            <button className="m2-btn sec mini" disabled={kilit} onClick={() => { setIzinModal({ tarih: secGun }); setSecGun(''); }}>
              İzin Ekle
            </button>
            <button className="m2-btn sec mini" onClick={() => { setAvansModal({ tarih: secGun }); setSecGun(''); }}>
              Avans Ekle
            </button>
            <button className="m2-btn sec mini" onClick={() => setSecGun('')}>
              Kapat
            </button>
          </div>
        )}

        <div className="m2-row" style={{ marginTop: 10 }}>
          <button className="m2-btn" disabled={kilit} onClick={() => setIzinModal({ tarih: '' })}>
            İzin
          </button>
          <button className="m2-btn" onClick={() => setAvansModal({ tarih: '' })}>
            Avans
          </button>
        </div>
      </div>

      <div className="m2-card">
        <h3 className="tk-baslik">İzinler — {donemYazi(donem)}</h3>
        <div className="m2-table-wrap">
          <table className="m2-table" data-tablo="izin" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Tür</th>
                <th className="sayi">Kesinti</th>
                <th>İzin Sebebi</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {veri.izinler.length === 0 && (
                <tr>
                  <td colSpan={5} className="m2-empty">
                    Bu ay izin kaydı yok.
                  </td>
                </tr>
              )}
              {veri.izinler.map((i) => (
                <tr key={i.id}>
                  <td className="nowrap">{tarihTR(i.tarih)}</td>
                  <td>{i.tur === 'Yarım' ? 'Yarım gün' : 'Tam gün'}</td>
                  <td className="sayi">{goster ? TL(i.kesinti) : GIZLI}</td>
                  <td>{i.sebep}</td>
                  <td>
                    <div className="m2-yk-islem">
                      <button className="m2-btn sec mini" disabled={kilit} onClick={() => setIzinModal({ kayit: i })}>
                        Düzenle
                      </button>
                      <button
                        className="m2-btn sec mini"
                        disabled={kilit}
                        onClick={() => window.confirm(`${tarihTR(i.tarih)} tarihli izin kaydı silinsin mi?`) && islem(() => api('izinSil', { method: 'POST', body: { id: i.id } }), 'İzin silindi')}
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3 className="tk-baslik" style={{ marginTop: 18 }}>
          Avanslar — {donemYazi(donem)}
        </h3>
        <div className="m2-table-wrap">
          <table className="m2-table" data-tablo="avans" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th>Tarih</th>
                <th className="sayi">Tutar</th>
                <th>Ödeme Şekli</th>
                <th>Avans Açıklaması</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {veri.avanslar.length === 0 && (
                <tr>
                  <td colSpan={5} className="m2-empty">
                    Bu ay avans yok.
                  </td>
                </tr>
              )}
              {veri.avanslar.map((a) => (
                <tr key={a.id}>
                  <td className="nowrap">{tarihTR(a.tarih)}</td>
                  <td className="sayi">{TL(a.tutar)}</td>
                  <td>{a.odemeSekli}</td>
                  <td>{a.aciklama}</td>
                  <td>
                    <div className="m2-yk-islem">
                      <button className="m2-btn sec mini" onClick={() => setAvansModal({ kayit: a })}>
                        Düzenle
                      </button>
                      <button
                        className="m2-btn sec mini"
                        onClick={() => window.confirm(`${TL(a.tutar)} tutarındaki avans silinsin mi? Ödeme makbuzu da silinir.`) && islem(() => api('avansSil', { method: 'POST', body: { id: a.id } }), 'Avans silindi')}
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m2-hint">Avans, personelin carisine otomatik Ödeme Makbuzu yazar ve tahakkuka girmez; tahakkuktan sonra cari bakiyesinden düşer.</p>
      </div>

      <div className="m2-card">
        <h3 className="tk-baslik">Hakediş Dökümü</h3>
        {!goster && <p className="m2-hint">Maaş bilgisi gizli. Görmek için göz simgesine basın.</p>}
        {goster && !dokum && <p className="m2-hint">Yükleniyor…</p>}
        {goster && dokum && (
          <>
            <div className="m2-table-wrap">
              <table className="m2-table pkl-dokum" data-tablo="dokum">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>İşlem</th>
                    <th className="sayi">Borç</th>
                    <th className="sayi">Alacak</th>
                    <th>Açıklama</th>
                    <th className="sayi">Bakiye</th>
                  </tr>
                </thead>
                <tbody>
                  {dokum.satirlar.length === 0 && (
                    <tr>
                      <td colSpan={6} className="m2-empty">
                        Henüz hareket yok.
                      </td>
                    </tr>
                  )}
                  {dokum.satirlar.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap">{tarihTR(r.tarih)}</td>
                      <td className="nowrap">{r.tur}</td>
                      <td className="sayi">{r.borc ? TL(r.borc) : '—'}</td>
                      <td className="sayi">{r.alacak ? TL(r.alacak) : '—'}</td>
                      <td>{r.aciklama}</td>
                      <td className={`sayi ${r.bakiye < 0 ? 'm2-neg' : ''}`}>
                        <strong>{TL(r.bakiye)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {dokum.satirlar.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={2}>Toplam</td>
                      <td className="sayi">{TL(dokum.toplamBorc)}</td>
                      <td className="sayi">{TL(dokum.toplamAlacak)}</td>
                      <td />
                      <td className={`sayi ${dokum.bakiye < 0 ? 'm2-neg' : ''}`}>
                        <strong>{TL(dokum.bakiye)}</strong>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="m2-hint">
              Bakiye, ödenecek maaştır. Eksi ise personel bize borçludur: avans veya izin kesintisi tahakkuktan önce girildiğinde böyle görünür ve tahakkukla normale döner.
            </p>
          </>
        )}
      </div>

      {izinModal && (
        <IzinModal
          personel={p}
          donem={donem}
          ilkTarih={izinModal.tarih}
          kayit={izinModal.kayit}
          goster={goster}
          onKaydet={async (payload) => {
            await api('izinKaydet', { method: 'POST', body: payload });
            bildir('İzin kaydedildi');
            await yukle();
          }}
          onKapat={() => setIzinModal(null)}
        />
      )}
      {avansModal && (
        <AvansModal
          personel={p}
          donem={donem}
          ilkTarih={avansModal.tarih}
          kayit={avansModal.kayit}
          yontemler={yontemler}
          onKaydet={async (payload) => {
            await api('avansKaydet', { method: 'POST', body: payload });
            bildir(payload.id ? 'Avans güncellendi' : 'Avans kaydedildi: ödeme makbuzu otomatik yazıldı');
            await yukle();
            await onDegisti?.();
          }}
          onKapat={() => setAvansModal(null)}
        />
      )}
      {notModal && (
        <NotModal
          onKaydet={async (metin) => {
            await api('notEkle', { method: 'POST', body: { personelId: id, metin } });
            bildir('Not eklendi');
            await yukle();
          }}
          onKapat={() => setNotModal(false)}
        />
      )}
      {formModal && (
        <PersonelFormModal
          personel={p}
          goster={goster}
          onKaydet={async (payload) => {
            const j = await api('personelKaydet', { method: 'POST', body: payload });
            bildir('Personel bilgileri güncellendi');
            await yukle();
            await onDegisti?.();
            return j;
          }}
          onBitti={() => setFormModal(false)}
          onKapat={() => setFormModal(false)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Personel formu (yeni / düzenle)
// ---------------------------------------------------------------------------
function PersonelFormModal({ personel, goster, onKaydet, onBitti, onKapat }) {
  const yeni = !personel;
  const [adSoyad, setAdSoyad] = useState(personel?.adSoyad || '');
  const [gorev, setGorev] = useState(personel?.gorev || '');
  const [maas, setMaas] = useState(personel && goster && personel.maas !== undefined ? String(personel.maas) : '');
  const [maasDonem, setMaasDonem] = useState(bugunISO().slice(0, 7));
  const [iseGiris, setIseGiris] = useState(personel?.iseGiris || bugunISO());
  const [sgkYok, setSgkYok] = useState(!!personel?.sgkYok);
  const [sgkBaslama, setSgkBaslama] = useState(personel?.sgkBaslama || '');
  const [cikisTarihi, setCikisTarihi] = useState(personel?.cikisTarihi || '');
  const [cikisSebebi, setCikisSebebi] = useState(personel?.cikisSebebi || '');
  const [telefon, setTelefon] = useState(personel?.telefon || '');
  const [adres, setAdres] = useState(personel?.adres || '');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);
  const maasDegisti = !yeni && String(maas).trim() !== '' && (!goster || sayi(maas) !== personel.maas);

  return (
    <ModalKabuk baslik={yeni ? 'Yeni Personel' : 'Personel Bilgileri'} onKapat={onKapat} genis>
      <div className="pkl-form">
        <div>
          <label className="m2-label">Ad Soyad *</label>
          <input className="m2-input" autoFocus value={adSoyad} onChange={(e) => setAdSoyad(e.target.value)} />
        </div>
        <div>
          <label className="m2-label">Görev</label>
          <input className="m2-input" value={gorev} onChange={(e) => setGorev(e.target.value)} placeholder="Örn. Şoför, Aşçı, Garson" />
        </div>
        <div>
          <label className="m2-label">{yeni ? 'Net Maaş *' : 'Net Maaş'}</label>
          <input className="m2-input" type="number" step="any" value={maas} onChange={(e) => setMaas(e.target.value)} placeholder={yeni || goster ? '' : 'Değiştirmek için yazın'} />
          {!yeni && !goster && <p className="m2-hint">Maaş gizli. Değiştirmek istemiyorsanız boş bırakın.</p>}
        </div>
        {maasDegisti && (
          <div>
            <label className="m2-label">Yeni maaş hangi dönemden itibaren geçerli?</label>
            <input className="m2-input" type="month" value={maasDonem} onChange={(e) => setMaasDonem(e.target.value)} />
            <p className="m2-hint">Geçmiş dönemlerin maaşı değişmez. Tahakkuk edilmiş döneme uygulanamaz.</p>
          </div>
        )}
        <div>
          <label className="m2-label">İşe Giriş Tarihi *</label>
          <input className="m2-input" type="date" value={iseGiris} onChange={(e) => setIseGiris(e.target.value)} />
        </div>
        <div>
          <label className="m2-label">SGK Başlama Tarihi</label>
          <input className="m2-input" type="date" value={sgkYok ? '' : sgkBaslama} disabled={sgkYok} onChange={(e) => setSgkBaslama(e.target.value)} />
          <label className="m2-onay" style={{ marginTop: 6 }}>
            <input type="checkbox" checked={sgkYok} onChange={(e) => setSgkYok(e.target.checked)} /> SGK yok
          </label>
        </div>
        <div>
          <label className="m2-label">Çıkış Tarihi</label>
          <input className="m2-input" type="date" value={cikisTarihi} onChange={(e) => setCikisTarihi(e.target.value)} />
        </div>
        <div>
          <label className="m2-label">Çıkış Sebebi</label>
          <input className="m2-input" value={cikisSebebi} disabled={!cikisTarihi} onChange={(e) => setCikisSebebi(e.target.value)} />
        </div>
        <div>
          <label className="m2-label">Telefon</label>
          <input className="m2-input" value={telefon} onChange={(e) => setTelefon(e.target.value)} />
        </div>
        <div className="genis">
          <label className="m2-label">İkametgâh Adresi</label>
          <textarea className="m2-input" rows={2} value={adres} onChange={(e) => setAdres(e.target.value)} />
        </div>
      </div>
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon
        onKapat={onKapat}
        devreDisi={!adSoyad.trim() || !iseGiris || (yeni && !(sayi(maas) > 0))}
        bekliyor={bekliyor}
        onKaydet={() =>
          calistir({
            id: personel?.id,
            adSoyad,
            gorev,
            maas: yeni || maasDegisti ? maas : '',
            maasDonem: maasDegisti ? maasDonem : undefined,
            iseGiris,
            sgkYok,
            sgkBaslama,
            cikisTarihi,
            cikisSebebi,
            telefon,
            adres,
          })
        }
      />
    </ModalKabuk>
  );
}

// ---------------------------------------------------------------------------
// İzin: tarih (veya aralık), tam/yarım gün, otomatik kesinti (elle değiştirilebilir), sebep
// ---------------------------------------------------------------------------
function IzinModal({ personel, donem, ilkTarih, kayit, goster, onKaydet, onKapat }) {
  const duzenle = !!kayit;
  const varsayilanTarih = kayit?.tarih || ilkTarih || `${donem}-01`;
  const [bas, setBas] = useState(varsayilanTarih);
  const [bit, setBit] = useState('');
  const [tur, setTur] = useState(kayit?.tur || 'Tam');
  const [kesinti, setKesinti] = useState(kayit && goster && kayit.kesinti !== undefined ? String(kayit.kesinti) : '');
  const [kesintiEl, setKesintiEl] = useState(!!kayit && goster);
  const [oneri, setOneri] = useState(null);
  const [sebep, setSebep] = useState(kayit?.sebep || '');
  const [onHata, setOnHata] = useState('');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onKapat);
  const aralik = !!bit && bit !== bas;

  useEffect(() => {
    let iptal = false;
    const t = setTimeout(async () => {
      try {
        const j = await api('izinOnizleme', { query: { personelId: personel.id, bas, ...(bit ? { bit } : {}), tur } });
        if (iptal) return;
        setOneri(j);
        setOnHata('');
        if (!kesintiEl) setKesinti(String(j.kesinti));
      } catch (e) {
        if (!iptal) {
          setOneri(null);
          setOnHata(e.message);
        }
      }
    }, 150);
    return () => {
      iptal = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bas, bit, tur, kesintiEl]);

  return (
    <ModalKabuk baslik={`${personel.adSoyad} — ${duzenle ? 'İzni Düzenle' : 'İzin'}`} onKapat={onKapat}>
      <label className="m2-label">{duzenle ? 'İzin Tarihi' : 'İzin Başlangıç Tarihi'} *</label>
      <input className="m2-input" type="date" aria-label="İzin başlangıç" value={bas} onChange={(e) => setBas(e.target.value)} />
      {!duzenle && (
        <>
          <label className="m2-label">Bitiş Tarihi (birden fazla gün için, opsiyonel)</label>
          <input className="m2-input" type="date" aria-label="İzin bitiş" value={bit} min={bas} onChange={(e) => setBit(e.target.value)} />
        </>
      )}
      <label className="m2-label">İzin Türü</label>
      <div className="m2-chips">
        <button type="button" className={`m2-chip ${tur === 'Tam' ? 'on' : ''}`} onClick={() => setTur('Tam')}>
          Tam gün
        </button>
        <button type="button" className={`m2-chip ${tur === 'Yarım' ? 'on' : ''}`} disabled={aralik} onClick={() => setTur('Yarım')}>
          Yarım gün
        </button>
      </div>
      <label className="m2-label">Kesinti Tutarı</label>
      <input
        className="m2-input"
        type="number"
        step="any"
        aria-label="Kesinti tutarı"
        value={kesinti}
        onChange={(e) => {
          setKesinti(e.target.value);
          setKesintiEl(true);
        }}
      />
      <p className="m2-hint">
        {oneri ? `Otomatik: ${oneri.gun} gün × maaş ÷ 30 = ${TL(oneri.kesinti)}. ` : ''}İsterseniz elle değiştirebilirsiniz.
        {aralik ? ' Aralıkta toplam tutar günlere paylaştırılır.' : ''}
      </p>
      <p className="m2-hint">Bu kesinti, personel carisine iade faturası olarak işlenir; tahakkuktaki maaşı değiştirmez.</p>
      {kesintiEl && oneri && sayi(kesinti) !== oneri.kesinti && (
        <button type="button" className="m2-link" onClick={() => { setKesintiEl(false); setKesinti(String(oneri.kesinti)); }}>
          Otomatik tutara dön
        </button>
      )}
      <label className="m2-label">İzin Sebebi</label>
      <textarea className="m2-input" rows={2} value={sebep} onChange={(e) => setSebep(e.target.value)} placeholder="Neden izin verildi?" />
      {(hata || onHata) && <div className="m2-info r">{hata || onHata}</div>}
      <ModalAksiyon
        onKapat={onKapat}
        devreDisi={!bas || !!onHata}
        bekliyor={bekliyor}
        onKaydet={() => calistir({ personelId: personel.id, id: kayit?.id, bas, bit: aralik ? bit : undefined, tur, kesinti, sebep })}
      />
    </ModalKabuk>
  );
}

// ---------------------------------------------------------------------------
// Avans: mini ödeme makbuzu (tarih, tutar, ödeme türü/şekli, açıklama)
// ---------------------------------------------------------------------------
const AVANS_TURLERI = ['Nakit', 'Banka Havalesi', 'Kredi Kartı'];
function AvansModal({ personel, donem, ilkTarih, kayit, yontemler, onKaydet, onKapat }) {
  const duzenle = !!kayit;
  const [tarih, setTarih] = useState(kayit?.tarih || ilkTarih || (bugunISO().startsWith(donem) ? bugunISO() : `${donem}-01`));
  const [tutar, setTutar] = useState(kayit ? String(kayit.tutar) : '');
  const [tur, setTur] = useState(kayit?.odemeTuru || 'Nakit');
  const [sekil, setSekil] = useState(kayit?.odemeSekli || '');
  const [aciklama, setAciklama] = useState(kayit?.aciklama || '');
  const [cekmece, setCekmece] = useState(false); // yeni avans çekmeceden verildi (günlük kasa); düzenlemede mevcut işaret korunur
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onKapat);
  const secenekler = yontemler.filter((y) => y.odeme_turu === tur);

  // Tek seçenek varsa (örn. TL Kasa) otomatik seçilir.
  useEffect(() => {
    if (!sekil && secenekler.length === 1) setSekil(secenekler[0].ad);
  }, [tur, yontemler]); // eslint-disable-line react-hooks/exhaustive-deps

  const payload = { personelId: personel.id, id: kayit?.id, tarih, tutar, odemeTuru: tur, aciklama, ...(cekmece && !duzenle && tur === 'Nakit' && tarih === bugunISO() ? { kasaGrubu: 'gunluk' } : {}), ...(tur === 'Nakit' ? { kasa: sekil } : { odemeHesabi: sekil }) };
  return (
    <ModalKabuk baslik={`${personel.adSoyad} — ${duzenle ? 'Avansı Düzenle' : 'Avans'}`} onKapat={onKapat}>
      <label className="m2-label">Avans Tarihi *</label>
      <input className="m2-input" type="date" aria-label="Avans tarihi" value={tarih} onChange={(e) => setTarih(e.target.value)} />
      <label className="m2-label">Avans Tutarı *</label>
      <input className="m2-input" type="number" step="any" aria-label="Avans tutarı" value={tutar} onChange={(e) => setTutar(e.target.value)} />
      <label className="m2-label">Ödeme Türü</label>
      <div className="m2-chips">
        {AVANS_TURLERI.map((t) => (
          <button
            key={t}
            type="button"
            className={`m2-chip ${tur === t ? 'on' : ''}`}
            onClick={() => {
              setTur(t);
              setSekil('');
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <label className="m2-label">{tur === 'Nakit' ? 'Kasa' : tur === 'Banka Havalesi' ? 'Banka' : 'Kart'} *</label>
      <select className="m2-select" aria-label="Ödeme şekli" value={sekil} onChange={(e) => setSekil(e.target.value)}>
        <option value="">— Seçin —</option>
        {secenekler.map((y) => (
          <option key={y.id} value={y.ad}>
            {y.ad}
          </option>
        ))}
      </select>
      {!duzenle && tur === 'Nakit' && tarih === bugunISO() && <CekmeceKutusu deger={cekmece} onChange={setCekmece} />}
      <label className="m2-label">Avans Açıklaması</label>
      <textarea className="m2-input" rows={2} value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="Avans neden verildi?" />
      <p className="m2-hint">Kaydedince {personel.adSoyad} carisine otomatik Ödeme Makbuzu, seçilen ödeme şekline karşı makbuz yazılır.</p>
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon onKapat={onKapat} devreDisi={!tarih || !(sayi(tutar) > 0) || !sekil} bekliyor={bekliyor} onKaydet={() => calistir(payload)} />
    </ModalKabuk>
  );
}

function NotModal({ onKaydet, onKapat }) {
  const [metin, setMetin] = useState('');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onKapat);
  return (
    <ModalKabuk baslik="Personel Notu Ekle" onKapat={onKapat}>
      <label className="m2-label">Not</label>
      <textarea className="m2-input" rows={4} autoFocus value={metin} onChange={(e) => setMetin(e.target.value)} />
      <p className="m2-hint">Not tarihi (saat dahil) kendiliğinden kaydedilir.</p>
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon onKapat={onKapat} devreDisi={!metin.trim()} bekliyor={bekliyor} onKaydet={() => calistir(metin)} />
    </ModalKabuk>
  );
}