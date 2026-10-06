import { useCallback, useEffect, useState } from 'react';
import { ModalAksiyon, ModalKabuk, TL, api, bugunISO, sayiFmt, tarihTR, useModalKaydet } from './m2Ortak';

// ---------------------------------------------------------------------------
// Tahakkuklar: fiş/fatura gelmeden ödeme yapılan giderleri (personel maaşı, sabit giderler) gider yapar.
//  - Şubat'ta açılınca OCAK dönemi gelir; dönem başına yalnızca 1 kez "Tahakkuk Et" yapılabilir.
//  - Personel: BRÜT maaş personelin carisine Cari fiş olur. İzin kesintileri izin girilirken iade faturası, avanslar ödeme
//    makbuzu olarak ZATEN cariye işlendiği için tahakkuktaki maaşı etkilemez; tahakkukla cari normale döner.
//  - Sabit gider: kendi kategorisinde, kendi carisine Cari fiş olur.
//  - Fiş tarihi = tahakkuk edilen gündür.
// ---------------------------------------------------------------------------

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const donemYazi = (d) => (d ? `${AYLAR[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : '');
const ayEkle = (donem, n) => {
  const [y, a] = donem.split('-').map(Number);
  const t = y * 12 + (a - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
const sayiGun = (n) => sayiFmt.format(n).replace(',00', '');
const zamanTR = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
};

export default function TahakkuklarSekmesi({ aktif, bildir, kategoriler, onDegisti }) {
  const guncel = bugunISO().slice(0, 7);
  const [donem, setDonem] = useState(ayEkle(guncel, -1)); // Şubat'ta Ocak
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [sabitModal, setSabitModal] = useState(null); // {} = yeni, gider = düzenle
  const [pasifModal, setPasifModal] = useState(null);
  const [detayModal, setDetayModal] = useState(null);
  const [pasifGoster, setPasifGoster] = useState(false);

  const yukle = useCallback(async () => {
    try {
      setVeri(await api('tahakkukOnizleme', { query: { donem } }));
      setHata('');
    } catch (e) {
      setHata(e.message);
    }
  }, [donem]);
  useEffect(() => {
    if (aktif) yukle();
  }, [aktif, yukle]);

  async function degisti() {
    await yukle();
    await onDegisti?.();
  }

  async function tahakkukEt() {
    const p = veri.personeller.filter((x) => x.fisYazilir).length;
    const g = veri.sabitGiderler.length;
    const mesaj = `${donemYazi(donem)} dönemi tahakkuk edilecek:\n\n${p} personel maaşı ve ${g} sabit gider\nToplam: ${TL(veri.toplam)}\nFiş tarihi: bugün (${tarihTR(bugunISO())})\n\nBu işlem ayda yalnızca 1 kez yapılabilir. Devam edilsin mi?`;
    if (!window.confirm(mesaj)) return;
    setBekliyor(true);
    try {
      const j = await api('tahakkukEt', { method: 'POST', body: { donem } });
      bildir(`${donemYazi(donem)} tahakkuk edildi: ${j.fisSayisi} fiş, toplam ${TL(j.toplam)}`);
      await degisti();
    } catch (e) {
      bildir(e.message, true);
    } finally {
      setBekliyor(false);
    }
  }
  async function geriAl() {
    if (!window.confirm(`${donemYazi(donem)} tahakkuku geri alınsın mı? Yazılan fişler silinir; sonra tekrar tahakkuk edebilirsiniz.`)) return;
    setBekliyor(true);
    try {
      await api('tahakkukGeriAl', { method: 'POST', body: { donem } });
      bildir('Tahakkuk geri alındı, fişler silindi');
      await degisti();
    } catch (e) {
      bildir(e.message, true);
    } finally {
      setBekliyor(false);
    }
  }
  async function sabitKaydet(payload) {
    await api('sabitGiderKaydet', { method: 'POST', body: payload });
    bildir(payload.id ? 'Sabit gider güncellendi' : 'Sabit gider eklendi');
    await degisti();
  }
  async function pasifKaydet(payload) {
    await api('sabitGiderPasif', { method: 'POST', body: payload });
    bildir(payload.pasifDonem ? 'Sabit gider pasife alındı' : 'Sabit gider yeniden etkinleştirildi');
    await degisti();
  }

  const tahakkuk = veri?.tahakkuk;
  const gelecekMi = donem >= guncel;
  const kayitVar = veri && (veri.personeller.length > 0 || veri.sabitGiderler.length > 0);
  const sonTahakkuk = veri?.donemler?.[0];

  return (
    <div className="m2-card">
      <div className="m2-row" style={{ flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Tahakkuklar</h2>
        <strong>Dönem:</strong>
        <input type="month" className="m2-input" style={{ width: 170 }} max={ayEkle(guncel, -1)} value={donem} onChange={(e) => e.target.value && setDonem(e.target.value)} />
        <span className="m2-hint" style={{ margin: 0 }}>
          {sonTahakkuk ? `Son tahakkuk: ${donemYazi(sonTahakkuk.donem)} (${tarihTR(sonTahakkuk.tarih)})` : 'Henüz tahakkuk yapılmadı'}
        </span>
        <div style={{ marginLeft: 'auto' }} className="m2-row">
          {tahakkuk && (
            <button className="m2-btn sec" disabled={bekliyor} onClick={geriAl}>
              Tahakkuku Geri Al
            </button>
          )}
          <button className="m2-btn" disabled={bekliyor || !veri || !!tahakkuk || gelecekMi || !kayitVar} onClick={tahakkukEt}>
            {bekliyor ? '…' : tahakkuk ? 'Tahakkuk Edildi' : `Tahakkuk Et (${donemYazi(donem)})`}
          </button>
        </div>
      </div>

      {hata && <div className="m2-info r">{hata}</div>}
      {gelecekMi && <div className="m2-info r">İçinde bulunulan veya gelecek ay tahakkuk edilemez. Geçmiş bir dönem seçin.</div>}
      {tahakkuk && (
        <div className="m2-info g">
          ✔ {donemYazi(donem)} dönemi {tarihTR(tahakkuk.tarih)} {zamanTR(tahakkuk.yapildiZaman)} tarihinde tahakkuk edildi. Toplam {TL(tahakkuk.toplam)}. Fişler Datalar'da kilitli, ikinci kez tahakkuk edilemez.
        </div>
      )}

      <div className="tk-grid">
        <div className="tk-panel">
          <h3 className="tk-baslik">Personel</h3>
          <div className="m2-table-wrap">
            <table className="m2-table tk-tablo" data-panel="personel">
              <thead>
                <tr>
                  <th>Ad Soyad</th>
                  <th>Görev</th>
                  <th className="sayi">Maaş</th>
                  <th className="sayi">Gün</th>
                  <th className="sayi">İzin</th>
                  <th className="sayi" title="İzin kesintileri izin girilirken iade faturası olarak cariye işlendi">İzin Kesintisi</th>
                  <th className="sayi">Tahakkuk (Maaş)</th>
                  <th className="sayi">O Ay Avans</th>
                  <th className="sayi">Ödenecek</th>
                  <th>Detay</th>
                </tr>
              </thead>
              <tbody>
                {veri && veri.personeller.length === 0 && (
                  <tr>
                    <td colSpan={10} className="m2-empty">
                      {donemYazi(donem)} döneminde çalışan personel yok.
                    </td>
                  </tr>
                )}
                {veri?.personeller.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.adSoyad}</strong>
                    </td>
                    <td>{p.gorev}</td>
                    <td className="sayi">{TL(p.maas)}</td>
                    <td className="sayi nowrap" title={p.calisilanGun !== p.ucretliGun ? `${p.calisilanGun} gün çalıştı, ${p.ucretliGun} gün ücretli (tam ay)` : undefined}>
                      {sayiGun(p.ucretliGun)}
                    </td>
                    <td className="sayi">{p.izinGun ? sayiGun(p.izinGun) : '—'}</td>
                    <td className="sayi">{p.kesinti ? TL(p.kesinti) : '—'}</td>
                    <td className="sayi">
                      <strong>{TL(p.brut)}</strong>
                      {!p.fisYazilir && <span className="m2-sub">fiş yazılmaz</span>}
                    </td>
                    <td className="sayi">{p.avans ? TL(p.avans) : '—'}</td>
                    <td className="sayi">
                      <strong>{TL(p.odenecek)}</strong>
                      {p.odenecek < 0 && <span className="m2-sub">personel borçlu</span>}
                    </td>
                    <td>
                      <button className="m2-btn sec mini" onClick={() => setDetayModal(p)}>
                        Detay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {veri && veri.personeller.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={6}>Personel toplamı</td>
                    <td className="sayi">{TL(veri.personeller.reduce((x, p) => x + (p.fisYazilir ? p.brut : 0), 0))}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="m2-hint">
            Tahakkuk maaşı BRÜT olarak personel carisine yazar. İzin kesintileri izin girilirken iade faturası, avanslar ödeme olarak zaten cariye işlendiği için maaşı değiştirmez; bu yüzden tahakkuktan önce personel carisi eksiye düşebilir ve tahakkukla normale döner. "Ödenecek", tahakkuk sonrası cari bakiyesidir. Maaşı Makbuz formundan "Ödeme" olarak ödersiniz. Gün sütunu tam ayda 30 görünür.
          </p>
        </div>

        <div className="tk-panel">
          <div className="m2-row" style={{ justifyContent: 'space-between' }}>
            <h3 className="tk-baslik">Sabit Giderler</h3>
            <button className="m2-btn mini" onClick={() => setSabitModal({})}>
              + Yeni
            </button>
          </div>
          <div className="m2-table-wrap">
            <table className="m2-table tk-tablo" data-panel="sabit">
              <thead>
                <tr>
                  <th>Gider</th>
                  <th>Kategori</th>
                  <th className="sayi">Tutar</th>
                  <th className="sayi">KDV</th>
                  <th>Başlangıç</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {veri && veri.sabitGiderler.length === 0 && (
                  <tr>
                    <td colSpan={6} className="m2-empty">
                      {donemYazi(donem)} döneminde tahakkuk edilecek sabit gider yok.
                    </td>
                  </tr>
                )}
                {veri?.sabitGiderler.map((g) => (
                  <tr key={g.id}>
                    <td>
                      <strong>{g.ad}</strong>
                    </td>
                    <td>{g.kategori}</td>
                    <td className="sayi">{TL(g.tutar)}</td>
                    <td className="sayi">{g.kdv ? TL(g.kdv) : '—'}</td>
                    <td className="nowrap">{donemYazi(g.baslangicDonem)}</td>
                    <td>
                      <div className="m2-yk-islem">
                        <button className="m2-btn sec mini" onClick={() => setSabitModal(g)}>
                          Düzenle
                        </button>
                        <button className="m2-btn sec mini" onClick={() => setPasifModal(g)}>
                          Pasife Al
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              {veri && veri.sabitGiderler.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={2}>Sabit gider toplamı</td>
                    <td className="sayi">{TL(veri.sabitGiderler.reduce((x, g) => x + g.tutar, 0))}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {veri && veri.pasifGiderler.length > 0 && (
            <>
              <button type="button" className="m2-link" onClick={() => setPasifGoster((v) => !v)}>
                {pasifGoster ? 'Pasif giderleri gizle' : `Pasif giderler (${veri.pasifGiderler.length})`}
              </button>
              {pasifGoster &&
                veri.pasifGiderler.map((g) => (
                  <div key={g.id} className="m2-row tk-pasif" style={{ justifyContent: 'space-between' }}>
                    <span>
                      {g.ad} — {TL(g.tutar)} ({donemYazi(g.pasifDonem)} döneminden itibaren pasif)
                    </span>
                    <button className="m2-btn sec mini" onClick={() => pasifKaydet({ id: g.id, pasifDonem: '' }).catch((e) => bildir(e.message, true))}>
                      Yeniden Etkinleştir
                    </button>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>

      {veri && (
        <div className="tk-toplam">
          Bu dönem tahakkuk toplamı: <strong>{TL(veri.toplam)}</strong>
        </div>
      )}

      {sabitModal && (
        <SabitGiderModal
          gider={sabitModal}
          varsayilanDonem={donem}
          kategoriler={kategoriler || []}
          onKaydet={sabitKaydet}
          onBitti={() => setSabitModal(null)}
          onKapat={() => setSabitModal(null)}
        />
      )}
      {pasifModal && (
        <PasifModal gider={pasifModal} varsayilanDonem={ayEkle(donem, 1)} onKaydet={pasifKaydet} onBitti={() => setPasifModal(null)} onKapat={() => setPasifModal(null)} />
      )}
      {detayModal && <DetayModal personel={detayModal} donem={donem} onKapat={() => setDetayModal(null)} />}
    </div>
  );
}

// ------------------------------ Sabit gider ---------------------------------
function SabitGiderModal({ gider, varsayilanDonem, kategoriler, onKaydet, onBitti, onKapat }) {
  const yeni = !gider.id;
  const [ad, setAd] = useState(gider.ad || '');
  const [tutar, setTutar] = useState(gider.tutar ? String(gider.tutar) : '');
  const [baslangicDonem, setBaslangicDonem] = useState(gider.baslangicDonem || varsayilanDonem);
  const [kategori, setKategori] = useState(gider.kategori || '');
  const [kdv, setKdv] = useState(gider.kdv ? String(gider.kdv) : '');
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);
  return (
    <ModalKabuk baslik={yeni ? 'Yeni Sabit Gider' : 'Sabit Gideri Düzenle'} onKapat={onKapat}>
      <label className="m2-label">Gider İsmi *</label>
      <input className="m2-input" autoFocus value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Örn. Kira, Muhasebeci, İnternet" />
      <label className="m2-label">Gider Tutarı (aylık) *</label>
      <input className="m2-input" type="number" step="any" value={tutar} onChange={(e) => setTutar(e.target.value)} />
      <label className="m2-label">Hangi dönemden itibaren tahakkuk edilecek *</label>
      <input className="m2-input" type="month" value={baslangicDonem} onChange={(e) => setBaslangicDonem(e.target.value)} />
      <p className="m2-hint">
        {baslangicDonem
          ? `${donemYazi(baslangicDonem)} dönemi, ${donemYazi(ayEkle(baslangicDonem, 1))} ayında tahakkuk edilir. Bu dönem ve sonrası her ay listelenir.`
          : ''}
      </p>
      <label className="m2-label">Gider Kategorisi *</label>
      <select className="m2-select" value={kategori} onChange={(e) => setKategori(e.target.value)}>
        <option value="">— Seçin —</option>
        {kategoriler.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
      <label className="m2-label">KDV Tutarı (opsiyonel, tutara dahil)</label>
      <input className="m2-input" type="number" step="any" value={kdv} onChange={(e) => setKdv(e.target.value)} />
      <p className="m2-hint">Kayıt, giderin adıyla bir cari açar. Değişiklikler yalnızca henüz tahakkuk edilmemiş dönemleri etkiler.</p>
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon
        onKapat={onKapat}
        devreDisi={!ad.trim() || !(Number(String(tutar).replace(',', '.')) > 0) || !baslangicDonem || !kategori}
        bekliyor={bekliyor}
        onKaydet={() => calistir({ id: gider.id, ad, tutar, baslangicDonem, kategori, kdv })}
      />
    </ModalKabuk>
  );
}

function PasifModal({ gider, varsayilanDonem, onKaydet, onBitti, onKapat }) {
  const [pasifDonem, setPasifDonem] = useState(varsayilanDonem);
  const { hata, bekliyor, calistir } = useModalKaydet(onKaydet, onBitti);
  return (
    <ModalKabuk baslik={`${gider.ad} — Pasife Al`} onKapat={onKapat}>
      <label className="m2-label">Hangi dönemden itibaren tahakkuk edilmesin?</label>
      <input className="m2-input" type="month" value={pasifDonem} onChange={(e) => setPasifDonem(e.target.value)} />
      <p className="m2-hint">
        {pasifDonem ? `${donemYazi(pasifDonem)} ve sonrası tahakkuk edilmez; öncesindeki dönemler listelenmeye devam eder.` : ''} Eski fişler silinmez, pasif giderlerden yeniden etkinleştirebilirsiniz.
      </p>
      {hata && <div className="m2-info r">{hata}</div>}
      <ModalAksiyon onKapat={onKapat} devreDisi={!pasifDonem} bekliyor={bekliyor} onKaydet={() => calistir({ id: gider.id, pasifDonem })} />
    </ModalKabuk>
  );
}

// --------------------------- Personel detayı --------------------------------
function DetayModal({ personel, donem, onKapat }) {
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState('');
  useEffect(() => {
    api('tahakkukDetay', { query: { donem, personelId: personel.id } })
      .then(setVeri)
      .catch((e) => setHata(e.message));
  }, [donem, personel.id]);
  return (
    <ModalKabuk baslik={`${personel.adSoyad} — ${donemYazi(donem)} Detayı`} onKapat={onKapat} genis>
      {hata && <div className="m2-info r">{hata}</div>}
      {!veri && !hata && <div className="m2-empty">Yükleniyor…</div>}
      {veri && (
        <>
          <h4 className="tk-alt">İzinler</h4>
          <div className="m2-table-wrap">
            <table className="m2-table" data-tablo="izin" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Tür</th>
                  <th className="sayi">Kesinti</th>
                  <th>İzin Sebebi</th>
                </tr>
              </thead>
              <tbody>
                {veri.izinler.length === 0 && (
                  <tr>
                    <td colSpan={4} className="m2-empty">
                      Bu dönemde izin yok.
                    </td>
                  </tr>
                )}
                {veri.izinler.map((i) => (
                  <tr key={i.id}>
                    <td className="nowrap">{tarihTR(i.tarih)}</td>
                    <td>{i.tur === 'Yarım' ? 'Yarım gün' : 'Tam gün'}</td>
                    <td className="sayi">{TL(i.kesinti)}</td>
                    <td>{i.sebep}</td>
                  </tr>
                ))}
              </tbody>
              {veri.izinler.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={2}>Toplam kesinti</td>
                    <td className="sayi">{TL(veri.izinler.reduce((x, i) => x + i.kesinti, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <h4 className="tk-alt">Avanslar</h4>
          <div className="m2-table-wrap">
            <table className="m2-table" data-tablo="avans" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th className="sayi">Tutar</th>
                  <th>Ödeme Şekli</th>
                  <th>Avans Açıklaması</th>
                </tr>
              </thead>
              <tbody>
                {veri.avanslar.length === 0 && (
                  <tr>
                    <td colSpan={4} className="m2-empty">
                      Bu dönemde avans yok.
                    </td>
                  </tr>
                )}
                {veri.avanslar.map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap">{tarihTR(a.tarih)}</td>
                    <td className="sayi">{TL(a.tutar)}</td>
                    <td>{a.odemeSekli}</td>
                    <td>{a.aciklama}</td>
                  </tr>
                ))}
              </tbody>
              {veri.avanslar.length > 0 && (
                <tfoot>
                  <tr>
                    <td>Toplam avans</td>
                    <td className="sayi">{TL(veri.avanslar.reduce((x, a) => x + a.tutar, 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="m2-modal-actions">
            <button className="m2-btn sec" onClick={onKapat}>
              Kapat
            </button>
          </div>
        </>
      )}
    </ModalKabuk>
  );
}