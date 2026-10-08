import { useEffect, useMemo, useState } from 'react';
import { Search, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { ModalKabuk } from '../Muhasebe2/m2Ortak';
import { bugunISO, fiyatFmt, fmt, rcApi, tarihTR, trNorm, TL } from './rcOrtak';

const DONEMLER = [
  ['ay3', '3 ay'],
  ['ay6', '6 ay'],
  ['yil1', '1 yıl'],
  ['ozel', 'Seçilen tarih'],
];

function Degisim({ d }) {
  if (!d) return <span className="rc-sonuk">—</span>;
  if (d.fark === 0 && d.yuzde === 0) return <span className="rc-sonuk">değişmedi</span>;
  const art = d.fark > 0;
  const Ikon = art ? TrendingUp : TrendingDown;
  return (
    <span className={art ? 'rc-kotu' : 'rc-iyi'} title={`${tarihTR(d.oncekiTarih)} tarihli fiyat: ${fiyatFmt(d.onceki)}${d.ilkKayit ? ' (ilk kayıt bu tarihten sonra)' : ''}`}>
      <Ikon size={13} style={{ verticalAlign: '-2px' }} /> {art ? '+' : ''}
      {fiyatFmt(d.fark)} {d.yuzde != null && <small>({art ? '+' : ''}%{fmt(d.yuzde, 1)})</small>}
      {d.ilkKayit && <small className="rc-sonuk"> *</small>}
    </span>
  );
}

export default function HamMaddeler({ onYenile, bildir }) {
  const [liste, setListe] = useState(null);
  const [ara, setAra] = useState('');
  const [ozelTarih, setOzelTarih] = useState('');
  const [sadeceZam, setSadeceZam] = useState(false);
  const [esik, setEsik] = useState(() => {
    try {
      return Number(localStorage.getItem('rc-zam-esik')) || 10;
    } catch {
      return 10;
    }
  });
  const [gecmis, setGecmis] = useState(null); // seçili malzeme
  const [duzenle, setDuzenle] = useState(null);

  const yukle = () =>
    rcApi('malzemeler', { query: ozelTarih ? { bas: ozelTarih } : {} })
      .then((j) => setListe(j.malzemeler))
      .catch((e) => bildir(e.message, true));
  useEffect(() => {
    yukle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ozelTarih]);

  const gorunen = useMemo(() => {
    if (!liste) return [];
    const n = trNorm(ara);
    return liste
      .filter((m) => (!n || trNorm(m.ad).includes(n)) && (!sadeceZam || (m.degisim.ay3 && m.degisim.ay3.yuzde >= esik)))
      .sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
  }, [liste, ara, sadeceZam, esik]);

  const zamlilar = liste ? liste.filter((m) => m.degisim.ay3 && m.degisim.ay3.yuzde >= esik).length : 0;

  return (
    <div className="m2-card rc-kart">
      <div className="rc-arac">
        <div className="rc-ara">
          <Search size={15} />
          <input className="m2-input" placeholder="Malzeme ara…" value={ara} onChange={(e) => setAra(e.target.value)} />
        </div>
        <label className="rc-onay" title="Son 3 ayda bu orandan fazla zamlanan malzemeler uyarılır">
          Zam uyarısı ≥ %
          <input
            className="m2-input rc-esik"
            inputMode="numeric"
            value={esik}
            onChange={(e) => {
              const v = Number(e.target.value.replace(/\D/g, '')) || 0;
              setEsik(v);
              try {
                localStorage.setItem('rc-zam-esik', String(v));
              } catch {
                /* tarayıcı depolaması yoksa yalnızca bu oturumda geçerli */
              }
            }}
          />
        </label>
        <label className="rc-onay">
          <input type="checkbox" checked={sadeceZam} onChange={(e) => setSadeceZam(e.target.checked)} /> Yalnızca zamlananlar ({zamlilar})
        </label>
        <label className="rc-onay">
          Karşılaştırma tarihi
          <input className="m2-input rc-tarih" type="date" value={ozelTarih} max={bugunISO()} onChange={(e) => setOzelTarih(e.target.value)} />
        </label>
        <button className="m2-btn mini" onClick={() => setDuzenle({ ad: '', birim: 'kg', fire: 0, tur: 'malzeme', aktif: true })}>
          <Plus size={14} style={{ verticalAlign: '-2px' }} /> Yeni malzeme
        </button>
      </div>

      <div className="m2-table-wrap">
        <table className="m2-table rc-ham-tablo">
          <thead>
            <tr>
              <th>Malzeme</th>
              <th className="sayi">Son fiyat (KDV+iskonto dahil)</th>
              <th>Son alış</th>
              {DONEMLER.map(([k, e]) => (
                <th key={k} className="sayi">{e}{k === 'ozel' && ozelTarih ? ` (${tarihTR(ozelTarih)})` : ''}</th>
              ))}
              <th>Kullanan ürünler</th>
            </tr>
          </thead>
          <tbody>
            {liste === null && (
              <tr><td colSpan={8} className="m2-empty">Yükleniyor…</td></tr>
            )}
            {liste && gorunen.length === 0 && (
              <tr><td colSpan={8} className="m2-empty">Malzeme yok.</td></tr>
            )}
            {gorunen.map((m) => {
              const zam = m.degisim.ay3 && m.degisim.ay3.yuzde >= esik;
              return (
                <tr key={m.id} className={`${m.aktif ? '' : 'oto'} ${zam ? 'rc-zamli' : ''}`}>
                  <td>
                    <button className="rc-link-ad" onClick={() => setGecmis(m)}>{m.ad}</button>
                    {m.tur === 'ambalaj' && <span className="rc-mini-etiket">ambalaj</span>}
                    {m.fire > 0 && <span className="rc-mini-etiket">fire %{fmt(m.fire, 0)}</span>}
                    {!m.aktif && <span className="rc-mini-etiket">pasif</span>}
                  </td>
                  <td className="sayi">{m.fiyat != null ? <b>{fiyatFmt(m.fiyat)} ₺/{m.birim}</b> : <span className="rc-uyari">fiyat yok</span>}</td>
                  <td>{m.fiyatTarihi ? <>{tarihTR(m.fiyatTarihi)}<br /><small className="rc-sonuk">{[m.firma, m.faturaNo].filter(Boolean).join(' · ')}</small></> : '—'}</td>
                  {DONEMLER.map(([k]) => (
                    <td key={k} className="sayi">{k === 'ozel' && !ozelTarih ? <span className="rc-sonuk">tarih seçin</span> : <Degisim d={m.degisim[k]} />}</td>
                  ))}
                  <td title={m.kullanan.join(', ')}>
                    {m.kullanan.length ? (
                      <>
                        <b>{m.kullanan.length}</b> <small className="rc-sonuk">{m.kullanan.slice(0, 2).join(', ')}{m.kullanan.length > 2 ? '…' : ''}</small>
                        {zam && <div className="rc-uyari-metin">Zamdan etkilenir</div>}
                      </>
                    ) : (
                      <span className="rc-sonuk">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="m2-hint">
        Fiyatlar birim başınadır (kg, lt veya adet) ve KDV + iskonto dahildir. Değişim, ilgili tarihteki fiyatla son fiyat arasındadır; * işareti o tarihten önce kayıt olmadığını, ilk kayıtla kıyaslandığını gösterir.
      </p>

      {gecmis && <FiyatGecmisi malzeme={gecmis} onKapat={() => setGecmis(null)} onDegisti={() => { yukle(); onYenile(); }} onDuzenle={() => { setDuzenle({ ...gecmis }); setGecmis(null); }} bildir={bildir} />}
      {duzenle && <MalzemeFormu m={duzenle} onKapat={() => setDuzenle(null)} onKaydedildi={() => { setDuzenle(null); yukle(); onYenile(); }} bildir={bildir} />}
    </div>
  );
}

function FiyatGecmisi({ malzeme, onKapat, onDegisti, onDuzenle, bildir }) {
  const [kayitlar, setKayitlar] = useState(null);
  const [form, setForm] = useState({ fiyat: '', tarih: bugunISO(), firma: '' });
  const yukle = () => rcApi('fiyatGecmisi', { query: { malzemeId: malzeme.id } }).then((j) => setKayitlar(j.kayitlar)).catch((e) => bildir(e.message, true));
  useEffect(() => {
    yukle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ekle() {
    try {
      await rcApi('fiyatEkle', { method: 'POST', body: { malzemeId: malzeme.id, birimFiyat: form.fiyat, tarih: form.tarih, firma: form.firma } });
      setForm({ fiyat: '', tarih: bugunISO(), firma: '' });
      await yukle();
      onDegisti();
    } catch (e) {
      bildir(e.message, true);
    }
  }
  async function sil(id) {
    if (!window.confirm('Bu fiyat kaydı silinsin mi?')) return;
    try {
      await rcApi('fiyatSil', { method: 'POST', body: { id } });
      await yukle();
      onDegisti();
    } catch (e) {
      bildir(e.message, true);
    }
  }

  return (
    <ModalKabuk baslik={`${malzeme.ad} — maliyet geçmişi`} onKapat={onKapat} genis ekSinif="rc-modal">
      <div className="rc-gecmis-ust">
        <span>Birim: <b>{malzeme.birim}</b> · Fire: <b>%{fmt(malzeme.fire, 0)}</b></span>
        <button className="m2-btn sec mini" onClick={onDuzenle}>Malzemeyi düzenle</button>
      </div>
      <div className="m2-table-wrap rc-tablo-kaydir">
        <table className="m2-table rc-gecmis-tablo">
          <thead>
            <tr>
              <th>Alış tarihi</th>
              <th>Kaynak (firma / fatura)</th>
              <th className="sayi">Miktar</th>
              <th className="sayi">Toplam</th>
              <th className="sayi">Birim fiyat</th>
              <th className="sayi">Önceki alışa göre</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {kayitlar === null && <tr><td colSpan={7} className="m2-empty">Yükleniyor…</td></tr>}
            {kayitlar && kayitlar.length === 0 && <tr><td colSpan={7} className="m2-empty">Henüz fiyat yok.</td></tr>}
            {(kayitlar || []).map((k, i) => {
              const onceki = kayitlar[i + 1];
              const fark = onceki ? k.birimFiyat - onceki.birimFiyat : null;
              return (
                <tr key={k.id}>
                  <td className="nowrap">{tarihTR(k.tarih)}</td>
                  <td>{[k.firma, k.faturaNo].filter(Boolean).join(' · ') || <span className="rc-sonuk">{k.kaynak === 'elle' ? 'elle girildi' : k.kaynak === 'eski' ? 'eski kayıt' : '—'}</span>}</td>
                  <td className="sayi">{k.miktar != null ? fmt(k.miktar, 2) : '—'}</td>
                  <td className="sayi">{k.toplamTutar != null ? TL(k.toplamTutar) : '—'}</td>
                  <td className="sayi"><b>{fiyatFmt(k.birimFiyat)}</b></td>
                  <td className="sayi">
                    {fark == null ? <span className="rc-sonuk">ilk kayıt</span> : fark === 0 ? <span className="rc-sonuk">aynı</span> : (
                      <span className={fark > 0 ? 'rc-kotu' : 'rc-iyi'}>{fark > 0 ? '+' : ''}{fiyatFmt(fark)} <small>({fark > 0 ? '+' : ''}%{fmt((fark / onceki.birimFiyat) * 100, 1)})</small></span>
                    )}
                  </td>
                  <td><button className="rc-ikon-btn" onClick={() => sil(k.id)} aria-label="Sil">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="rc-fiyat-ekle">
        <b>Elle fiyat ekle</b>
        <input className="m2-input" type="date" value={form.tarih} max={bugunISO()} onChange={(e) => setForm({ ...form, tarih: e.target.value })} />
        <input className="m2-input" placeholder={`TL / ${malzeme.birim} (KDV+iskonto dahil)`} inputMode="decimal" value={form.fiyat} onChange={(e) => setForm({ ...form, fiyat: e.target.value })} />
        <input className="m2-input" placeholder="Firma (isteğe bağlı)" value={form.firma} onChange={(e) => setForm({ ...form, firma: e.target.value })} />
        <button className="m2-btn mini" disabled={!form.fiyat} onClick={ekle}>Ekle</button>
      </div>
    </ModalKabuk>
  );
}

export function MalzemeFormu({ m, onKapat, onKaydedildi, bildir }) {
  const [f, setF] = useState({ ad: m.ad, birim: m.birim, fire: String(m.fire || 0).replace('.', ','), tur: m.tur, aktif: m.aktif });
  const [hata, setHata] = useState('');
  async function kaydet() {
    try {
      const j = await rcApi('malzemeKaydet', { method: 'POST', body: { id: m.id, ad: f.ad, birim: f.birim, fireYuzde: f.fire, tur: f.tur, aktif: f.aktif } });
      onKaydedildi(j.id);
    } catch (e) {
      setHata(e.message);
    }
  }
  async function sil() {
    if (!window.confirm(`"${m.ad}" ve fiyat geçmişi silinsin mi?`)) return;
    try {
      await rcApi('malzemeSil', { method: 'POST', body: { id: m.id } });
      bildir('Malzeme silindi');
      onKaydedildi(null);
    } catch (e) {
      setHata(e.message);
    }
  }
  return (
    <ModalKabuk baslik={m.id ? 'Malzemeyi düzenle' : 'Yeni malzeme'} onKapat={onKapat}>
      <label className="m2-label">Ad</label>
      <input className="m2-input" value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} />
      <label className="m2-label">Birim (fiyat bu birim başınadır)</label>
      <select className="m2-select" value={f.birim} onChange={(e) => setF({ ...f, birim: e.target.value })}>
        <option value="kg">kg — reçetede gram</option>
        <option value="lt">lt — reçetede ml</option>
        <option value="adet">adet</option>
      </select>
      <label className="m2-label">Fire % (temizlik / pişme kaybı)</label>
      <input className="m2-input" inputMode="decimal" value={f.fire} onChange={(e) => setF({ ...f, fire: e.target.value })} />
      <label className="m2-label">Tür</label>
      <select className="m2-select" value={f.tur} onChange={(e) => setF({ ...f, tur: e.target.value })}>
        <option value="malzeme">Malzeme</option>
        <option value="ambalaj">Ambalaj (kutu, poşet…)</option>
      </select>
      <label className="rc-onay" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={f.aktif} onChange={(e) => setF({ ...f, aktif: e.target.checked })} /> Aktif (pasif malzeme listelerde seçilemez)
      </label>
      {hata && <div className="m2-info r">{hata}</div>}
      <div className="m2-modal-actions">
        {m.id && <button className="m2-btn sec" onClick={sil}>Sil</button>}
        <button className="m2-btn sec" onClick={onKapat}>Vazgeç</button>
        <button className="m2-btn" disabled={!f.ad.trim()} onClick={kaydet}>Kaydet</button>
      </div>
    </ModalKabuk>
  );
}
