import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { ModalKabuk } from '../Muhasebe2/m2Ortak';
import SecimKutusu from './SecimKutusu';
import { fmt, fiyatFmt, rcApi, RECETE_BIRIMI, sayi, TL } from './rcOrtak';

let sayac = 0;
const anahtar = () => `s${++sayac}`;

// Ürün reçetesi veya yarı mamul reçetesi düzenleme penceresi.
// urun: { id, ad, fiyat, netFiyat } (tur === 'urun');  yariMamul: { id?, ad, ciktiMiktar, ciktiBirim } (tur === 'yari_mamul')
export default function ReceteDuzenle({ tur, urun, yariMamul, malzemeler, yariMamuller, onKapat, onKaydedildi, onMalzemelerYenile }) {
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState('');
  const [bekliyor, setBekliyor] = useState(false);
  const [satirlar, setSatirlar] = useState([]);
  const [gerekmez, setGerekmez] = useState(false);
  const [receteId, setReceteId] = useState(null);
  const [ad, setAd] = useState(yariMamul?.ad || '');
  const [ciktiMiktar, setCiktiMiktar] = useState(yariMamul?.ciktiMiktar ? String(yariMamul.ciktiMiktar) : '');
  const [ciktiBirim, setCiktiBirim] = useState(yariMamul?.ciktiBirim || 'g');
  const [yeni, setYeni] = useState(null); // { key, ad, birim, fire, tur }

  useEffect(() => {
    let iptal = false;
    (async () => {
      try {
        const q = tur === 'urun' ? { urunId: urun.id } : yariMamul?.id ? { id: yariMamul.id } : null;
        if (!q) {
          setSatirlar([{ key: anahtar(), secim: '', miktar: '', paket: false }]);
          return;
        }
        const j = await rcApi('receteDetay', { query: q });
        if (iptal) return;
        if (j.recete) {
          setReceteId(j.recete.id);
          setGerekmez(!!j.recete.gerekmez);
        }
        const s = (j.kalemler || []).map((k) => ({
          key: anahtar(),
          secim: k.malzemeId ? `m:${k.malzemeId}` : `a:${k.altReceteId}`,
          miktar: String(k.miktar).replace('.', ','),
          paket: !!k.paket,
        }));
        setSatirlar(s.length ? s : [{ key: anahtar(), secim: '', miktar: '', paket: false }]);
      } catch (e) {
        if (!iptal) setHata(e.message);
      } finally {
        if (!iptal) setYukleniyor(false);
      }
    })();
    return () => {
      iptal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const malzemeMap = useMemo(() => new Map(malzemeler.map((m) => [m.id, m])), [malzemeler]);
  const ymMap = useMemo(() => new Map(yariMamuller.map((m) => [m.id, m])), [yariMamuller]);

  const secenekler = useMemo(
    () => [
      ...malzemeler
        .filter((m) => m.aktif)
        .filter((m) => tur === 'urun' || m.tur !== 'ambalaj')
        .map((m) => ({ id: `m:${m.id}`, ad: m.ad, grup: m.tur === 'ambalaj' ? 'Ambalaj' : 'Malzeme', ek: m.fiyat != null ? `${fiyatFmt(m.fiyat)} ₺/${m.birim}` : 'fiyat yok' })),
      ...yariMamuller
        .filter((y) => y.id !== receteId)
        .map((y) => ({ id: `a:${y.id}`, ad: y.ad, grup: 'Yarı mamul', ek: `${fiyatFmt(y.birimMaliyet)} ₺/${y.ciktiBirim}` })),
    ],
    [malzemeler, yariMamuller, receteId, tur],
  );

  function satirHesap(s) {
    const miktar = sayi(s.miktar);
    if (!s.secim || !(miktar > 0)) return { tutar: null, birim: '' };
    const [t, id] = [s.secim.slice(0, 1), s.secim.slice(2)];
    if (t === 'm') {
      const m = malzemeMap.get(id);
      if (!m) return { tutar: null, birim: '' };
      const birim = RECETE_BIRIMI[m.birim];
      if (m.fiyat == null) return { tutar: null, birim, fiyatYok: true };
      const bolen = m.birim === 'adet' ? 1 : 1000;
      return { tutar: (m.fiyat / bolen) * miktar * (1 / (1 - (m.fire || 0) / 100)), birim, fire: m.fire };
    }
    const y = ymMap.get(id);
    if (!y) return { tutar: null, birim: '' };
    if (y.eksik && y.eksik.length) return { tutar: null, birim: y.ciktiBirim, fiyatYok: true };
    return { tutar: y.birimMaliyet * miktar, birim: y.ciktiBirim };
  }

  const toplamlar = useMemo(() => {
    let yerinde = 0;
    let paket = 0;
    let eksik = false;
    let girilenMiktar = 0;
    satirlar.forEach((s) => {
      const h = satirHesap(s);
      if (s.secim && sayi(s.miktar) > 0 && h.tutar == null) eksik = true;
      if (h.tutar != null) {
        if (s.paket) paket += h.tutar;
        else yerinde += h.tutar;
      }
      if (s.secim && sayi(s.miktar) > 0 && (h.birim === 'g' || h.birim === 'ml')) girilenMiktar += sayi(s.miktar);
    });
    return { yerinde, paket, eksik, girilenMiktar };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satirlar, malzemeMap, ymMap]);

  const guncelle = (key, patch) => setSatirlar((l) => l.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const sil = (key) => setSatirlar((l) => (l.length > 1 ? l.filter((s) => s.key !== key) : [{ key: anahtar(), secim: '', miktar: '', paket: false }]));

  async function yeniMalzemeKaydet() {
    setHata('');
    try {
      const j = await rcApi('malzemeKaydet', { method: 'POST', body: { ad: yeni.ad, birim: yeni.birim, fireYuzde: yeni.fire, tur: yeni.tur } });
      await onMalzemelerYenile();
      guncelle(yeni.key, { secim: `m:${j.id}` });
      setYeni(null);
    } catch (e) {
      setHata(e.message);
    }
  }

  async function kaydet() {
    setHata('');
    if (tur === 'yari_mamul') {
      if (!ad.trim()) return setHata('Yarı mamul adı gerekli');
      if (!(sayi(ciktiMiktar) > 0)) return setHata('Çıktı miktarını yazın (ör. 155)');
    }
    setBekliyor(true);
    try {
      const kalemler = satirlar
        .filter((s) => s.secim)
        .map((s) => ({ malzemeId: s.secim.startsWith('m:') ? s.secim.slice(2) : null, altReceteId: s.secim.startsWith('a:') ? s.secim.slice(2) : null, miktar: s.miktar, paket: s.paket }));
      if (!gerekmez && !kalemler.length) {
        setBekliyor(false);
        return setHata('En az bir malzeme ekleyin veya "reçete gerekmez" işaretleyin');
      }
      await rcApi('receteKaydet', {
        method: 'POST',
        body: tur === 'urun'
          ? { tur, urunId: urun.id, ad: urun.ad, gerekmez, kalemler }
          : { tur, id: receteId || yariMamul?.id || undefined, ad: ad.trim(), ciktiMiktar, ciktiBirim, kalemler },
      });
      onKaydedildi();
    } catch (e) {
      setHata(e.message);
      setBekliyor(false);
    }
  }

  const net = urun ? urun.netFiyat : 0;
  const kar = net - toplamlar.yerinde;
  const baslik = tur === 'urun' ? `Reçete — ${urun.ad}` : yariMamul?.id ? `Yarı mamul — ${yariMamul.ad}` : 'Yeni yarı mamul';

  return (
    <ModalKabuk baslik={baslik} onKapat={onKapat} genis ekSinif="rc-modal">
      {yukleniyor ? (
        <p className="m2-empty">Yükleniyor…</p>
      ) : (
        <>
          {tur === 'yari_mamul' && (
            <div className="rc-ym-ust">
              <div>
                <label className="m2-label">Ad</label>
                <input className="m2-input" value={ad} onChange={(e) => setAd(e.target.value)} placeholder="ör. Salçalı yemek bazı" />
              </div>
              <div>
                <label className="m2-label">Bu karışımdan çıkan miktar</label>
                <div className="m2-row">
                  <input className="m2-input" inputMode="decimal" value={ciktiMiktar} onChange={(e) => setCiktiMiktar(e.target.value)} placeholder="155" />
                  <select className="m2-select rc-kisa" value={ciktiBirim} onChange={(e) => setCiktiBirim(e.target.value)}>
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="adet">adet</option>
                  </select>
                </div>
                {toplamlar.girilenMiktar > 0 && (
                  <button type="button" className="rc-link" onClick={() => setCiktiMiktar(String(toplamlar.girilenMiktar).replace('.', ','))}>
                    Çıktı = girilen toplam ({fmt(toplamlar.girilenMiktar, 0)})
                  </button>
                )}
              </div>
            </div>
          )}

          {tur === 'urun' && (
            <label className="rc-gerekmez">
              <input type="checkbox" checked={gerekmez} onChange={(e) => setGerekmez(e.target.checked)} />
              <span>Bu ürün için reçete gerekmez (kola, su gibi) — hatırlatmalarda çıkmaz</span>
            </label>
          )}

          {!(tur === 'urun' && gerekmez) && (
            <>
              <div className="m2-table-wrap rc-tablo-kaydir">
                <table className="m2-table rc-recete-tablo">
                  <thead>
                    <tr>
                      <th>Malzeme / yarı mamul</th>
                      <th className="sayi">Miktar</th>
                      {tur === 'urun' && <th title="Yalnızca paket satışlarda maliyete eklenir">Paket</th>}
                      <th className="sayi">Maliyet</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {satirlar.map((s) => {
                      const h = satirHesap(s);
                      return (
                        <tr key={s.key}>
                          <td className="rc-hucre-sec">
                            <SecimKutusu
                              secenekler={secenekler}
                              deger={s.secim}
                              onSec={(id) => guncelle(s.key, { secim: id })}
                              yer="Malzeme ara…"
                              onYeni={(metin) => setYeni({ key: s.key, ad: metin || '', birim: 'kg', fire: '0', tur: 'malzeme' })}
                              yeniEtiket="+ Yeni malzeme tanımla"
                            />
                          </td>
                          <td className="sayi">
                            <div className="rc-miktar">
                              <input className="m2-input" inputMode="decimal" value={s.miktar} onChange={(e) => guncelle(s.key, { miktar: e.target.value })} placeholder="0" />
                              <span>{h.birim || ''}</span>
                            </div>
                          </td>
                          {tur === 'urun' && (
                            <td>
                              <label className="rc-paket" title="Paket satışta eklenir">
                                <input type="checkbox" checked={s.paket} onChange={(e) => guncelle(s.key, { paket: e.target.checked })} />
                                <Package size={14} />
                              </label>
                            </td>
                          )}
                          <td className={`sayi ${h.fiyatYok ? 'rc-uyari' : ''}`}>{h.tutar != null ? TL(h.tutar) : h.fiyatYok ? 'fiyat yok' : '—'}</td>
                          <td>
                            <button type="button" className="rc-ikon-btn" onClick={() => sil(s.key)} aria-label="Satırı sil">
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" className="m2-btn sec mini" onClick={() => setSatirlar((l) => [...l, { key: anahtar(), secim: '', miktar: '', paket: false }])}>
                <Plus size={14} style={{ verticalAlign: '-2px' }} /> Satır ekle
              </button>

              {yeni && (
                <div className="rc-yeni-malzeme">
                  <b>Yeni malzeme</b>
                  <input className="m2-input" value={yeni.ad} onChange={(e) => setYeni({ ...yeni, ad: e.target.value })} placeholder="Malzeme adı" />
                  <select className="m2-select rc-kisa" value={yeni.birim} onChange={(e) => setYeni({ ...yeni, birim: e.target.value })}>
                    <option value="kg">kg (reçetede g)</option>
                    <option value="lt">lt (reçetede ml)</option>
                    <option value="adet">adet</option>
                  </select>
                  <input className="m2-input rc-kisa" inputMode="decimal" value={yeni.fire} onChange={(e) => setYeni({ ...yeni, fire: e.target.value })} placeholder="Fire %" title="Fire (zayiat) %" />
                  <select className="m2-select rc-kisa" value={yeni.tur} onChange={(e) => setYeni({ ...yeni, tur: e.target.value })}>
                    <option value="malzeme">Malzeme</option>
                    <option value="ambalaj">Ambalaj</option>
                  </select>
                  <button type="button" className="m2-btn mini" onClick={yeniMalzemeKaydet}>Ekle</button>
                  <button type="button" className="m2-btn sec mini" onClick={() => setYeni(null)}>Vazgeç</button>
                </div>
              )}

              <div className="rc-ozet">
                <div>
                  <span>{tur === 'urun' ? 'Maliyet (yerinde)' : 'Toplam maliyet'}</span>
                  <b>{TL(toplamlar.yerinde)}</b>
                </div>
                {tur === 'urun' && (
                  <>
                    <div>
                      <span>Paket ek maliyeti</span>
                      <b>+ {TL(toplamlar.paket)}</b>
                    </div>
                    <div>
                      <span>KDV hariç satış</span>
                      <b>{TL(net)}</b>
                    </div>
                    <div className={kar >= 0 ? 'iyi' : 'kotu'}>
                      <span>Kâr</span>
                      <b>
                        {TL(kar)} {net > 0 && <small>(%{fmt((kar / net) * 100, 1)})</small>}
                      </b>
                    </div>
                  </>
                )}
                {tur === 'yari_mamul' && sayi(ciktiMiktar) > 0 && (
                  <div>
                    <span>Birim maliyet</span>
                    <b>
                      {fiyatFmt(toplamlar.yerinde / sayi(ciktiMiktar))} ₺/{ciktiBirim}
                    </b>
                  </div>
                )}
              </div>
              {toplamlar.eksik && <p className="rc-uyari-metin">Fiyatı olmayan malzeme var: toplam eksik hesaplanır. Ham Maddeler sekmesinden fiyat girin veya fatura yükleyin.</p>}
            </>
          )}

          {hata && <div className="m2-info r">{hata}</div>}
          <div className="m2-modal-actions">
            <button className="m2-btn sec" onClick={onKapat}>Vazgeç</button>
            <button className="m2-btn" disabled={bekliyor} onClick={kaydet}>{bekliyor ? '…' : 'Kaydet'}</button>
          </div>
        </>
      )}
    </ModalKabuk>
  );
}
