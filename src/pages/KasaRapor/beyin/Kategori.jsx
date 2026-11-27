import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, Save } from 'lucide-react';
import { kategoriYukle, ayarKaydet } from './beyinVeri';
import { tl, tl2, yuzde, isaretli, AYLIK, GUNLER, tarihKisa } from './beyinHesap';
import { kategoriModel, kategoriTespitleri, fiyatOnerisi, kombinasyonlar, cikarmaEtkisi, sandvicDerinligi } from './beyinKategori';

const RENK = { kirmizi: 'by-k', turuncu: 'by-t', sari: 'by-s', yesil: 'by-y', mavi: 'by-m' };
const IKON = { kirmizi: '🔴', turuncu: '🟠', sari: '🟡', yesil: '🟢', mavi: '🔵' };
const yuzdeTam = (n) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}%${Math.round(Math.abs(n) * 100)}`);

function Isi({ satirlar }) {
  const h = new Map();
  let max = 0;
  let ilk = 24;
  let son = 0;
  for (const r of satirlar || []) {
    const c = Number(r.c) / 8;
    h.set(`${r.d}-${r.s}`, c);
    if (c > max) max = c;
    if (c > 10) { ilk = Math.min(ilk, r.s); son = Math.max(son, r.s); }
  }
  const saatler = [];
  for (let s = ilk; s <= son; s++) saatler.push(s);
  if (!saatler.length) return <div className="by-bos">Veri yok.</div>;
  return (
    <div className="by-isi-kap">
      <table className="by-isi">
        <thead><tr><th />{saatler.map((s) => <th key={s}>{s}</th>)}</tr></thead>
        <tbody>
          {GUNLER.map((g, i) => (
            <tr key={g}>
              <th>{g}</th>
              {saatler.map((s) => {
                const c = h.get(`${i + 1}-${s}`) || 0;
                const o = max ? c / max : 0;
                return <td key={s} className={o > 0.55 ? 'by-isi-koyu' : ''} style={{ background: `rgba(233,79,55,${0.06 + o * 0.94})` }} title={`${g} ${s}:00 · ${tl(c)}`}>{c >= 1000 ? `${(Math.round(c / 100) / 10).toLocaleString('tr-TR')}b` : Math.round(c)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cikar({ g, komb }) {
  const e = cikarmaEtkisi(g, komb);
  return (
    <div className="by-cikar">
      <b>Menüden çıkarırsan (son 4 haftaya göre):</b>
      <span>Ayda yaklaşık {tl(e.aylikCiro)} ciro{e.aylikKar !== null ? ` ve ${tl(e.aylikKar)} kâr` : ''} kaybolur — müşteriler başka bir şeye yönelmezse.</span>
      {e.fis > 0 && (
        <span>
          Son 60 günde {e.fis} fişte var. Bu fişlerin %{Math.round((e.yalnizTum || 0) * 100)} kadarında başka HİÇBİR ürün yok (o müşteri sadece bunun için gelmiş, kaybedilebilir);
          %{Math.round((e.yalnizKat || 0) * 100)} kadarında bu kategoriden başka kalem yok.
        </span>
      )}
      <span>
        {e.aylikKar !== null && e.aylikKar < 0
          ? '👉 Zararına satılıyor: çıkarmak ya da fiyatı düzeltmek kârı artırır.'
          : (e.yalnizTum || 0) > 0.3
            ? '👉 Dikkat: alanların önemli kısmı sadece bunun için geliyor; çıkarmak müşteri kaybettirebilir.'
            : '👉 Diğer ürünlerle birlikte alınıyor; çıkarırsan müşteri büyük olasılıkla başka kalemle idare eder.'}
      </span>
    </div>
  );
}

export default function Kategori({ k, d, model, setD }) {
  const km = useMemo(() => kategoriModel(model, k), [model, k]);
  const tespit = useMemo(() => kategoriTespitleri(km), [km]);
  const fiyat = useMemo(() => fiyatOnerisi(model, km), [model, km]);
  const [rpc, setRpc] = useState(null);
  const [hata, setHata] = useState('');
  const [acik, setAcik] = useState(null);
  const [cikar, setCikar] = useState(null);
  const [hedefGirdi, setHedefGirdi] = useState(km.ay.hedef ? String(km.ay.hedef) : '');
  const [mesaj, setMesaj] = useState('');
  const [sadeceDegisen, setSadeceDegisen] = useState(true);
  const fiyatRef = useRef(null);

  useEffect(() => {
    let iptal = false;
    setRpc(null);
    kategoriYukle(k)
      .then((r) => { if (!iptal) setRpc(r); })
      .catch((e) => { if (!iptal) setHata(e.message); });
    return () => { iptal = true; };
  }, [k]);

  const komb = useMemo(() => (rpc ? kombinasyonlar(model, km, rpc) : null), [rpc, model, km]);
  const fisOrt = useMemo(() => {
    if (!rpc) return null;
    const son4 = (rpc.hafta || []).filter((h) => model.son4.includes(h.h));
    const fis = son4.reduce((t, h) => t + Number(h.fis), 0);
    const c = son4.reduce((t, h) => t + Number(h.c), 0);
    const kalem = son4.reduce((t, h) => t + Number(h.kalem), 0);
    return fis ? { fis, ort: c / fis, kalem: kalem / fis } : null;
  }, [rpc, model]);
  const derinlik = useMemo(() => (k === 'SOĞUK SANDVİÇ' ? sandvicDerinligi(model) : null), [k, model]);
  const maxCiro = Math.max(1, ...km.liste.map((g) => g.ciro));
  const fiyatListe = sadeceDegisen ? fiyat.filter((f) => f.oneri !== f.fiyat) : fiyat;
  const fiyatToplam = fiyat.reduce((t, f) => t + f.aylik, 0);

  const hedefKaydet = async () => {
    const yeni = { ...(d.ayarlar?.kategori_hedef || {}) };
    const v = Number(String(hedefGirdi).replace(',', '.'));
    if (String(hedefGirdi).trim() === '' || !v) delete yeni[k];
    else yeni[k] = v;
    try {
      await ayarKaydet({ kategori_hedef: yeni });
      setD((o) => ({ ...o, ayarlar: { ...o.ayarlar, kategori_hedef: yeni } }));
      setMesaj('Kaydedildi');
    } catch (e) {
      setMesaj(e.message);
    }
  };

  const pngIndir = async () => {
    if (!fiyatRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const c = await html2canvas(fiyatRef.current, { backgroundColor: '#ffffff', scale: 2 });
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `fiyat-onerisi-${k.toLocaleLowerCase('tr').replace(/\s+/g, '-')}.png`;
    a.click();
  };

  const o = km.ozet;
  return (
    <div className="by-arac-ic">
      {hata && <div className="by-hata">{hata}</div>}
      <div className="by-mini">
        <div><span>Ciro (4 hafta)</span><b>{tl(o.ciro)}</b><small>toplam satışın %{Math.round(o.pay * 100)} kadarı</small></div>
        <div><span>Brüt kâr</span><b>{o.kar === null ? '—' : tl(o.kar)}</b><small>{o.kar === null ? 'maliyet bilinmiyor' : `marj ${yuzde(o.ciro ? o.kar / o.ciro : null)} · maliyeti hesaplanabilen %${Math.round(o.kapsam * 100)}`}</small></div>
        <div className={o.trend === null ? '' : o.trend >= 0 ? 'by-iyi' : 'by-kotu'}><span>Trend</span><b>{yuzdeTam(o.trend)}</b><small>haftalık ciro, önceki 8 haftaya göre</small></div>
        <div><span>Fiş başına</span><b>{fisOrt ? tl(fisOrt.ort) : '…'}</b><small>{fisOrt ? `${fisOrt.kalem.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} kalem · ${fisOrt.fis} fiş` : 'yükleniyor'}</small></div>
      </div>

      <div className="by-hedef-kat">
        <div className="by-cubuk-ust">
          <b>Kategori hedefi (bu ay brüt kâr)</b>
          <span>{km.ay.hedef ? `${km.ay.kar === null ? '—' : tl(km.ay.kar)} / ${tl(km.ay.hedef)}` : 'girilmedi'}</span>
        </div>
        {km.ay.hedef > 0 && km.ay.oran !== null && (
          <div className="by-cubuk">
            <i className={km.ay.oran < km.ay.beklenen * 0.9 ? 'by-geri' : ''} style={{ width: `${Math.min(1, km.ay.oran) * 100}%` }} />
            <em style={{ left: `${km.ay.beklenen * 100}%` }} />
          </div>
        )}
        {km.ay.kar === null && <small className="by-ipucu">Bu kategorinin marjı bilinmiyor; hedef takibi için ürün maliyetlerini ya da Ayarlar'dan tahmini marj gir.</small>}
        <div className="by-satir-btn">
          <input className="by-orta" inputMode="decimal" value={hedefGirdi} onChange={(e) => setHedefGirdi(e.target.value)} placeholder="Aylık hedef ₺" />
          <button type="button" className="by-btn" onClick={hedefKaydet}><Save size={16} /> Hedefi kaydet</button>
          {mesaj && <small className="by-not">{mesaj}</small>}
        </div>
      </div>

      {tespit.length > 0 && (
        <>
          <h4>Bu kategoride dikkat çekenler</h4>
          <div className="by-ktespit">
            {tespit.map((t, i) => (
              <div key={i} className={`by-kart ${RENK[t.s]}`}>
                <h3>{IKON[t.s]} {t.baslik}</h3>
                <p>{t.metin}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <h4>Kalemler (boylar birleşik · son 4 hafta)</h4>
      <p className="by-ipucu">Satıra dokun: boy kırılımı, porsiyon başına fiyat ve "menüden çıkarırsam ne olur?". Yanlış birleşen olursa Ürün–malzeme ekranında "Birleşik ad" ile düzelt.</p>
      <table className="by-tablo by-ktablo">
        <thead>
          <tr><th>Kalem</th><th className="sag">Adet</th><th className="sag">Ciro</th><th>Pay</th><th className="sag">Kâr</th><th className="sag">Marj</th><th className="sag">Trend</th></tr>
        </thead>
        <tbody>
          {km.liste.map((g) => (
            <Fragment key={g.ad}>
              <tr className="by-tikla" onClick={() => setAcik((x) => (x === g.ad ? null : g.ad))}>
                <td>{acik === g.ad ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <b>{g.ad}</b>{g.varyant.length > 1 ? <small> {g.varyant.length} çeşit</small> : null}{g.tutarsiz ? <small className="by-kotu-y"> · fiyat tutarsız</small> : null}</td>
                <td className="sag">{Math.round(g.adet)}</td>
                <td className="sag">{tl(g.ciro)}</td>
                <td className="by-paycell"><i style={{ width: `${(g.ciro / maxCiro) * 100}%` }} /><span>%{Math.round((g.ciro / Math.max(1, o.ciro)) * 100)}</span></td>
                <td className={`sag ${g.karVar && g.kar < 0 ? 'by-kotu-y' : ''}`}>{g.karVar ? tl(g.kar) : '—'}</td>
                <td className="sag">{g.marj === null ? <span className="by-soluk">maliyet yok</span> : yuzde(g.marj)}</td>
                <td className={`sag ${g.trend !== null && g.trend <= -0.15 ? 'by-kotu-y' : g.trend !== null && g.trend >= 0.15 ? 'by-iyi-y' : ''}`}>{yuzdeTam(g.trend)}</td>
              </tr>
              {acik === g.ad && (
                <tr className="by-alt">
                  <td colSpan={7}>
                    <table className="by-tablo by-icte">
                      <thead><tr><th>Çeşit</th><th className="sag">Adet</th><th className="sag">Fiyat</th><th className="sag">Maliyet</th><th className="sag">Marj</th><th className="sag">Porsiyon başına</th></tr></thead>
                      <tbody>
                        {g.varyant.map((u) => {
                          const p = g.porsiyon.find((x) => x.ad === u.ad);
                          return (
                            <tr key={u.ad}>
                              <td>{u.ad}</td>
                              <td className="sag">{u.adet}</td>
                              <td className="sag">{u.fiyat ? tl2(km.menuFiyat.has(u.ad) ? km.menuFiyat.get(u.ad) : u.fiyat) : '—'}</td>
                              <td className="sag">{u.birim === null ? '—' : tl2(u.birim)}</td>
                              <td className="sag">{yuzde(u.marj)}</td>
                              <td className="sag">{p ? `${p.porsiyon} ${p.birimAd} · ${tl2(p.porsiyonFiyat)}` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="by-satir-btn">
                      <button type="button" className="by-btn by-hafif" onClick={() => setCikar((x) => (x === g.ad ? null : g.ad))}>Menüden çıkarırsam ne olur?</button>
                    </div>
                    {cikar === g.ad && (komb ? <Cikar g={g} komb={komb} /> : <small className="by-not">Fiş verisi yükleniyor…</small>)}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      <h4>Fiyat listesi önerisi (%40 brüt marj hedefi)</h4>
      <p className="by-ipucu">Marjı %40'ın altındaki kalemler için önerilen fiyat (50 ₺'ye kadar tam liraya, üstü 5'in katına yuvarlandı). Menüdeki fiyatları DEĞİŞTİRMEZ; satış adedi aynı kalırsa aylık etkisi gösterilir. Toplam etki: <b>{isaretli(fiyatToplam)}/ay</b>.</p>
      <div className="by-satir-btn">
        <label className="by-kutu"><input type="checkbox" checked={sadeceDegisen} onChange={(e) => setSadeceDegisen(e.target.checked)} /> Sadece değişenler</label>
        <button type="button" className="by-btn" onClick={pngIndir} disabled={!fiyatListe.length}><Download size={16} /> PNG indir</button>
      </div>
      <div ref={fiyatRef} className="by-png">
        <div className="by-png-bas"><b>{k} — fiyat önerisi</b><span>{model.bugun} · %40 brüt marj hedefi</span></div>
        {fiyatListe.length === 0 ? (
          <div className="by-bos">Bütün kalemler %40 marjın üstünde 👍</div>
        ) : (
          <table className="by-tablo">
            <thead><tr><th>Ürün</th><th className="sag">Şu an</th><th className="sag">Öneri</th><th className="sag">Maliyet</th><th className="sag">Marj</th><th className="sag">Aylık etki</th></tr></thead>
            <tbody>
              {fiyatListe.map((f) => (
                <tr key={f.ad}>
                  <td>{f.ad}</td>
                  <td className="sag">{tl2(f.fiyat)}</td>
                  <td className={`sag ${f.oneri !== f.fiyat ? 'by-kotu-y' : ''}`}><b>{tl(f.oneri)}</b></td>
                  <td className="sag">{tl2(f.birim)}</td>
                  <td className="sag">{yuzde(f.marj)} → {yuzde(f.yeniMarj)}</td>
                  <td className="sag">{f.aylik ? isaretli(f.aylik) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {derinlik && derinlik.length > 0 && (
        <>
          <h4>Sandviç derinliği (sandviç başına, tek sandviçli fişler)</h4>
          <div className="by-cubuklar by-derin">
            {(() => {
              const max = Math.max(1, ...derinlik.map((x) => x.tutar));
              return derinlik.map((x) => (
                <div key={x.h} className="by-cbk" title={`${tarihKisa(x.h)}: ${x.kalem.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} malzeme · ${tl(x.tutar)}`}>
                  <em>{x.kalem.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}</em>
                  <i style={{ height: `${(x.tutar / max) * 100}%` }} />
                  <span>{tarihKisa(x.h).split(' ')[0]}</span>
                </div>
              ));
            })()}
          </div>
          <p className="by-ipucu">Çubuk: ekmek dışındaki malzemelerin sandviç başına tutarı (son hafta {tl(derinlik[derinlik.length - 1].tutar)}); üstteki sayı: ortalama malzeme adedi. Kasada malzeme önermek bu çubukları yükseltir.</p>
        </>
      )}

      <h4>Birlikte alınanlar (son 60 gün{komb ? `, ${komb.fis} fiş` : ''})</h4>
      {!komb && <div className="by-bos">Fiş verisi yükleniyor…</div>}
      {komb && komb.setOneri && (
        <div className="by-set">
          <b>Set önerisi — fişlerin en az %25'inde görülen kalemler:</b>
          <ul>
            {komb.setOneri.kalemler.map((x) => <li key={x.ad}>{x.ad} <small>fişlerin %{Math.round(x.oran * 100)} kadarında · {tl(x.fiyat)}</small></li>)}
          </ul>
          <span>
            Tek tek {tl(komb.setOneri.ayri)} → set olarak <b>{tl(komb.setOneri.fiyat)}</b> (%10 indirim)
            {komb.setOneri.maliyet !== null ? ` · maliyet ${tl2(komb.setOneri.maliyet)} · kâr ${tl(komb.setOneri.kar)} (${yuzde(komb.setOneri.marj)})` : ''}. Ekmek ve tabak hariç.
          </span>
        </div>
      )}
      {komb && komb.sepetler.length > 0 && (
        <table className="by-tablo">
          <thead><tr><th>En sık birlikte alınan set</th><th className="sag">Fiş</th><th className="sag">Pay</th></tr></thead>
          <tbody>{komb.sepetler.map((x) => <tr key={x.ad}><td>{x.ad}</td><td className="sag">{x.n}</td><td className="sag">%{Math.round(x.oran * 100)}</td></tr>)}</tbody>
        </table>
      )}
      {komb && komb.ciftler.length > 0 && (
        <div className="by-ciftler">
          {komb.ciftler.map((x) => (
            <div key={`${x.ilk}-${x.ikinci}`} className="by-sepet">
              <div className="by-sepet-yazi"><b>{x.ilk}</b> alanların <b>%{Math.round(x.oran * 100)}</b> kadarı <b>{x.ikinci}</b> da alıyor</div>
              <div className="by-sepet-cubuk"><i style={{ width: `${x.oran * 100}%` }} /></div>
              <small>{x.n} fişte birlikte</small>
            </div>
          ))}
        </div>
      )}

      <h4>Saat haritası (son 8 haftanın ortalama cirosu)</h4>
      {rpc ? <Isi satirlar={rpc.saat} /> : <div className="by-bos">Yükleniyor…</div>}
      <p className="by-ipucu">Ayda yaklaşık {tl(o.ciro * AYLIK)} ciro yapan bu kategorinin en yoğun saatleri koyu renkte.</p>
    </div>
  );
}
