import { useMemo, useState } from 'react';
import { X, Trash2, Plus, Save } from 'lucide-react';
import Kategori from './Kategori';
import { isaretKoy, ayarKaydet, eslestirmeKaydet, eslestirmeSil, notEkle, notSil, deneyEkle, deneySil, alimEkle, alimSil } from './beyinVeri';
import {
  tl, tl2, yuzde, isaretli, birimMaliyet, AYLIK, tarihKisa, GUNLER,
  urunSimulasyon, malzemeSimulasyon, yeniUrunHesap, kanalHesap, odemeHesap, saatHaritasi, sepetHesap, fireHesap, deneySonuc, malzemeKullanimi, hedefHesap, receteSirasi, GRUPLAR, varsayilanGrup,
} from './beyinHesap';

const BASLIK = {
  kategori: 'Kategori', kart: 'Tespit detayı', urun: 'Ürün detayı', supheli: 'Yanlış girilmiş olabilecek satışlar', simulator: 'Ya şöyle yapsaydık', deney: 'Deneyler', sepet: 'Birlikte satılanlar',
  kanal: 'Kanal, ödeme ve saat', fiyat: 'Fiyat bekçisi', alim: 'Alımlar ve fire', eslestirme: 'Ürün – malzeme eşleştirmesi', notlar: 'Notlar', ayarlar: 'Hedef ve ayarlar',
};

const sayi = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const bugunIso = (model) => model.bugun;

function Cubuklar({ seri, haftalar, alan = 'c', bicim = tl }) {
  const deger = haftalar.map((h) => seri.get(h)?.[alan] || 0);
  const max = Math.max(1, ...deger);
  return (
    <div className="by-cubuklar">
      {haftalar.map((h, i) => (
        <div key={h} className="by-cbk" title={`${tarihKisa(h)}: ${bicim(deger[i])}`}>
          <i style={{ height: `${(deger[i] / max) * 100}%` }} />
          <span>{tarihKisa(h).split(' ')[0]}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------- Ürün detayı ----------------
function UrunDetay({ model, urun, onAc }) {
  const u = model.urunMap.get(urun);
  if (!u) return <div className="by-bos">Bu ürün son 17 haftada satılmamış.</div>;
  const mal = model.maliyet.get(u.ad);
  if (u.sanal) {
    return (
      <div className="by-arac-ic">
        <div className="by-mini">
          <div><span>Son 4 hafta</span><b>{u.adet} sandviç</b><small>{u.ekmek} satırı sayıldı</small></div>
          <div><span>Ortalama fiyat</span><b>{tl2(u.fiyat)}</b><small>ekmek + malzemeler</small></div>
          <div><span>Ortalama maliyet</span><b>{u.birim === null ? '—' : tl2(u.birim)}</b><small>malzemelerin %{Math.round(u.kapsam * 100)} kadarının maliyeti biliniyor</small></div>
          <div><span>Marj</span><b>{yuzde(u.marj)}</b><small>{u.kar !== null ? `${tl(u.kar * AYLIK)}/ay kâr` : ''}</small></div>
        </div>
        <p className="by-aciklama">Hesap: içinde tek ekmek olan {u.ornek} fişteki soğuk sandviç kalemlerinden ortalama alınır (birden çok sandviçli fişlerde malzemeyi hangi sandviçe gittiği bilinemediği için kullanılmaz). Adet tüm ekmek satırlarından gelir.</p>
        <h4>Haftalık sandviç adedi</h4>
        <Cubuklar seri={u.seri} haftalar={model.haftalar} alan="a" bicim={(x) => `${x} adet`} />
        <h4>Ortalama bir sandviçin içeriği</h4>
        <table className="by-tablo">
          <thead><tr><th>Kalem</th><th className="sag">Sandviç başına</th><th className="sag">Tutar</th><th className="sag">Maliyet</th></tr></thead>
          <tbody>
            {u.icerik.slice(0, 20).map((x) => {
              const m = model.maliyet.get(x.ad);
              return (
                <tr key={x.ad}>
                  <td>{x.ad}</td>
                  <td className="sag">{x.adet.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}</td>
                  <td className="sag">{tl2(x.tutar)}</td>
                  <td className="sag">{m ? tl2(x.adet * m.birim) : <span className="by-kotu-y">tanımsız</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className="by-arac-ic">
      <div className="by-mini">
        <div><span>Son 4 hafta</span><b>{u.adet} adet</b><small>{tl(u.ciro)} ciro</small></div>
        <div><span>Satış fiyatı</span><b>{u.fiyat ? tl2(u.fiyat) : '—'}</b><small>ortalama</small></div>
        <div><span>Maliyet</span><b>{mal ? tl2(mal.birim) : '—'}</b><small>{mal ? mal.kaynak : 'tanımsız'}</small></div>
        <div><span>Marj</span><b>{yuzde(u.marj)}</b><small>{u.kar !== null ? `${tl(u.kar * AYLIK)}/ay kâr` : ''}</small></div>
      </div>
      <h4>Haftalık adet</h4>
      <Cubuklar seri={u.seri} haftalar={model.haftalar} alan="a" bicim={(x) => `${x} adet`} />
      <h4>Haftalık ciro</h4>
      <Cubuklar seri={u.seri} haftalar={model.haftalar} />
      {mal && (
        <>
          <h4>Maliyetin içeriği</h4>
          <table className="by-tablo">
            <tbody>
              {mal.kalemler.map((k, i) => {
                const m = model.malzMap.get(k.m);
                return (
                  <tr key={i}>
                    <td>{m?.ad}</td>
                    <td className="sag">{k.a} × {m?.birim_adi || 'birim'}</td>
                    <td className="sag">{tl2(k.a * birimMaliyet(m))}</td>
                  </tr>
                );
              })}
              {mal.sabit ? (<tr><td>Elle girilen maliyet</td><td /><td className="sag">{tl2(mal.sabit)}</td></tr>) : null}
            </tbody>
          </table>
        </>
      )}
      <div className="by-satir-btn">
        <button type="button" className="by-btn by-ana" onClick={() => onAc({ id: 'simulator', urun: u.ad })}>Simülatörde aç</button>
        <button type="button" className="by-btn" onClick={() => onAc({ id: 'eslestirme', urun: u.ad })}>Maliyeti düzenle</button>
      </div>
    </div>
  );
}

// ---------------- Şüpheli satışlar ----------------
function Supheli({ d, setD }) {
  const menuFiyat = new Map((d.urunler || []).map((u) => [u.ad, Number(u.fiyat)]));
  const dogru = new Set(d.isaretler.filter((i) => i.anahtar.startsWith('dogru:')).map((i) => i.anahtar.slice(6)));
  const liste = (d.veri.supheli || []).filter((s) => !dogru.has(s.id));
  const isaretle = async (s) => {
    await isaretKoy(`dogru:${s.id}`, null);
    setD((o) => ({ ...o, isaretler: [...o.isaretler, { anahtar: `dogru:${s.id}` }] }));
  };
  return (
    <div className="by-arac-ic">
      <p className="by-aciklama"><b>Normal fiyat</b> = o ürünün son 17 haftadaki satış fiyatlarının medyanı (ortanca). Ölçüt: girilen fiyat medyanın 4 katından fazla ve medyandan en az 150 ₺ yüksek. Menüdeki güncel fiyat da karşılaştırma için yanında. Bu satışlar hesaplara katılmıyor. Gerçekten doğruysa "Doğru giriş" de, hesaplara eklensin (Yenile'ye bas). Yanlışsa Veri sayfasından düzelt — bu sayfa satışlara dokunmaz.</p>
      {liste.length === 0 && <div className="by-bos">Şüpheli satış yok.</div>}
      <table className="by-tablo">
        <thead><tr><th>Zaman</th><th>Masa</th><th>Ürün</th><th className="sag">Girilen</th><th className="sag">Medyan</th><th className="sag">Menüde</th><th /></tr></thead>
        <tbody>
          {liste.map((s) => (
            <tr key={s.id}>
              <td>{s.ts.slice(8, 10)}.{s.ts.slice(5, 7)} {s.ts.slice(11)}</td>
              <td>{s.masa}</td>
              <td>{s.ad}</td>
              <td className="sag by-kotu-y">{tl2(s.fiyat)}</td>
              <td className="sag">{tl2(s.medyan)}</td>
              <td className="sag">{menuFiyat.has(s.ad) ? tl2(menuFiyat.get(s.ad)) : '—'}</td>
              <td><button type="button" className="by-btn by-hafif" onClick={() => isaretle(s)}>Doğru giriş</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Simülatör ----------------
function Simulator({ model, baslangic }) {
  const [sekme, setSekme] = useState(baslangic ? 'urun' : 'yeni');
  const urunler = useMemo(() => model.urunListe.filter((u) => u.eslesti && u.adet > 0).sort((a, b) => a.ad.localeCompare(b.ad, 'tr')), [model]);
  const [urun, setUrun] = useState(baslangic || urunler[0]?.ad || '');
  const u = model.urunMap.get(urun);
  const [yeniFiyat, setYeniFiyat] = useState(u ? String(Math.round(u.fiyat * 100) / 100) : '');
  const [porsiyon, setPorsiyon] = useState('100');
  const [adetDeg, setAdetDeg] = useState('0');
  const sim = u && u.eslesti ? urunSimulasyon(u, { yeniFiyat: sayi(yeniFiyat), porsiyon: sayi(porsiyon) / 100, adetDegisim: sayi(adetDeg) / 100 }) : null;

  const [malz, setMalz] = useState(String(model.d.malzemeler[0]?.id || ''));
  const mObj = model.malzMap.get(Number(malz));
  const [malzFiyat, setMalzFiyat] = useState(mObj ? String(mObj.fiyat) : '');
  const msim = mObj ? malzemeSimulasyon(model, malz, sayi(malzFiyat)) : null;

  const [kalemler, setKalemler] = useState([]);
  const [ekMaliyet, setEkMaliyet] = useState('0');
  const [satis, setSatis] = useState('175');
  const hd = hedefHesap(model, model.d.ayarlar);
  const [gunlukHedef, setGunlukHedef] = useState(hd.gunlukGereken ? String(Math.round(hd.gunlukGereken)) : '400');
  const yu = yeniUrunHesap(model, kalemler, sayi(ekMaliyet), sayi(satis), sayi(gunlukHedef));

  return (
    <div className="by-arac-ic">
      <div className="by-sekmeler">
        <button type="button" className={sekme === 'yeni' ? 'on' : ''} onClick={() => setSekme('yeni')}>Yeni ürün / tabak</button>
        <button type="button" className={sekme === 'urun' ? 'on' : ''} onClick={() => setSekme('urun')}>Ürün fiyatı / porsiyon</button>
        <button type="button" className={sekme === 'malz' ? 'on' : ''} onClick={() => setSekme('malz')}>Malzeme fiyatı</button>
      </div>

      {sekme === 'urun' && (
        <>
          <div className="by-form">
            <label>Ürün
              <select value={urun} onChange={(e) => { setUrun(e.target.value); const x = model.urunMap.get(e.target.value); setYeniFiyat(x ? String(Math.round(x.fiyat * 100) / 100) : ''); }}>
                {urunler.map((x) => <option key={x.ad} value={x.ad}>{x.ad}</option>)}
              </select>
            </label>
            <label>Yeni fiyat (₺)<input inputMode="decimal" value={yeniFiyat} onChange={(e) => setYeniFiyat(e.target.value)} /></label>
            <label>Porsiyon (%)<input inputMode="decimal" value={porsiyon} onChange={(e) => setPorsiyon(e.target.value)} /></label>
            <label>Satış değişimi (%)<input inputMode="decimal" value={adetDeg} onChange={(e) => setAdetDeg(e.target.value)} /></label>
          </div>
          {sim && (
            <div className="by-mini">
              <div><span>Şu an</span><b>{tl(sim.once)}/ay</b><small>{tl2(u.fiyat)} satış · {tl2(u.birim)} maliyet · {yuzde(u.marj)}</small></div>
              <div><span>Böyle olursa</span><b>{tl(sim.sonra)}/ay</b><small>{tl2(sim.yeniBirim)} maliyet · {yuzde(sim.yeniMarj)}</small></div>
              <div className={sim.fark >= 0 ? 'by-iyi' : 'by-kotu'}><span>Fark</span><b>{isaretli(sim.fark)}/ay</b><small>ayda ~{Math.round(sim.aylikAdet)} adet üzerinden</small></div>
            </div>
          )}
        </>
      )}

      {sekme === 'malz' && (
        <>
          <div className="by-form">
            <label>Malzeme
              <select value={malz} onChange={(e) => { setMalz(e.target.value); const x = model.malzMap.get(Number(e.target.value)); setMalzFiyat(x ? String(x.fiyat) : ''); }}>
                {model.d.malzemeler.map((m) => <option key={m.id} value={m.id}>{m.ad}</option>)}
              </select>
            </label>
            <label>Yeni fiyat ({mObj?.fiyat_turu === 'kg' ? '₺/kg' : '₺/adet'})<input inputMode="decimal" value={malzFiyat} onChange={(e) => setMalzFiyat(e.target.value)} /></label>
          </div>
          {msim && (
            <>
              <div className="by-mini">
                <div className={msim.aylik <= 0 ? 'by-iyi' : 'by-kotu'}><span>Aylık maliyet farkı</span><b>{isaretli(msim.aylik)}</b><small>şu an {tl2(mObj.fiyat)} · {msim.etkilenen.length} ürün etkileniyor</small></div>
              </div>
              <table className="by-tablo">
                <thead><tr><th>Ürün</th><th className="sag">Adet başı</th><th className="sag">Aylık</th><th className="sag">Marj</th></tr></thead>
                <tbody>
                  {msim.etkilenen.slice(0, 25).map((e) => (
                    <tr key={e.ad}><td>{e.ad}</td><td className="sag">{isaretli(e.adetFark).replace(' ₺', '')} ₺</td><td className="sag">{isaretli(e.aylik)}</td><td className="sag">{yuzde(e.eskiMarj)} → {yuzde(e.yeniMarj)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

      {sekme === 'yeni' && (
        <>
          <p className="by-aciklama">Kahvaltı tabağı gibi yeni bir ürünü kur: malzemeleri ve adetlerini seç, satış fiyatını yaz. Ekmek gibi listede olmayanları "ek maliyet"e yaz.</p>
          <table className="by-tablo">
            <thead><tr><th>Malzeme</th><th className="sag">Adet</th><th className="sag">Maliyet</th><th /></tr></thead>
            <tbody>
              {kalemler.map((k, i) => {
                const m = model.malzMap.get(Number(k.m));
                return (
                  <tr key={i}>
                    <td>
                      <select value={k.m} onChange={(e) => setKalemler((l) => l.map((x, j) => (j === i ? { ...x, m: e.target.value } : x)))}>
                        {model.d.malzemeler.map((mm) => <option key={mm.id} value={mm.id}>{mm.ad} ({mm.birim_adi || 'birim'})</option>)}
                      </select>
                    </td>
                    <td className="sag"><input className="by-kisa" inputMode="decimal" value={k.a} onChange={(e) => setKalemler((l) => l.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} /></td>
                    <td className="sag">{tl2(sayi(k.a) * birimMaliyet(m))}</td>
                    <td><button type="button" className="by-ikon" onClick={() => setKalemler((l) => l.filter((_, j) => j !== i))} aria-label="Sil"><Trash2 size={16} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" className="by-btn" onClick={() => setKalemler((l) => [...l, { m: String(model.d.malzemeler[0]?.id), a: '1' }])}><Plus size={16} /> Malzeme ekle</button>
          <div className="by-form">
            <label>Ek maliyet (₺)<input inputMode="decimal" value={ekMaliyet} onChange={(e) => setEkMaliyet(e.target.value)} /></label>
            <label>Satış fiyatı (₺)<input inputMode="decimal" value={satis} onChange={(e) => setSatis(e.target.value)} /></label>
            <label>Günlük hedef ek kâr (₺)<input inputMode="decimal" value={gunlukHedef} onChange={(e) => setGunlukHedef(e.target.value)} /></label>
          </div>
          <div className="by-mini">
            <div><span>Maliyet</span><b>{tl2(yu.maliyet)}</b><small>adet başı</small></div>
            <div className={yu.kar >= 0 ? 'by-iyi' : 'by-kotu'}><span>Kâr</span><b>{tl2(yu.kar)}</b><small>marj {yuzde(yu.marj)}</small></div>
            <div><span>Hedefe</span><b>{yu.gunlukAdet ? `günde ${Math.ceil(yu.gunlukAdet)} adet` : '—'}</b><small>sadece YENİ müşteriye satılanlar sayılır</small></div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------- Deneyler ----------------
function Deneyler({ d, model, onYenile }) {
  const kategoriler = [...model.kategoriler.keys()].sort((a, b) => a.localeCompare(b, 'tr'));
  const [ad, setAd] = useState('');
  const [bas, setBas] = useState(bugunIso(model));
  const [kat, setKat] = useState('');
  const [urunler, setUrunler] = useState([]);
  const [ara, setAra] = useState('');
  const aday = ara.length >= 2 ? model.urunListe.filter((u) => u.ad.toLocaleLowerCase('tr').includes(ara.toLocaleLowerCase('tr')) && !urunler.includes(u.ad)).slice(0, 8) : [];
  const ekle = async () => {
    if (!ad.trim()) return;
    await deneyEkle({ ad: ad.trim(), baslangic: bas, kategori: kat || null, urunler });
    setAd(''); setUrunler([]); setAra('');
    onYenile();
  };
  return (
    <div className="by-arac-ic">
      <p className="by-aciklama">Yeni bir ürün ya da değişiklik başlattığında buraya ekle. Başlangıçtan önceki 4 hafta ile sonraki haftalar karşılaştırılır: kâr gerçekten arttı mı, yoksa yeni ürün eskilerin yerini mi aldı?</p>
      <div className="by-form">
        <label>Deney adı<input value={ad} onChange={(e) => setAd(e.target.value)} placeholder="Basit kahvaltı tabağı 175 ₺" /></label>
        <label>Başlangıç<input type="date" value={bas} onChange={(e) => setBas(e.target.value)} /></label>
        <label>Ölçülecek kategori
          <select value={kat} onChange={(e) => setKat(e.target.value)}>
            <option value="">Tüm işletme</option>
            {kategoriler.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label>Deney ürünleri (isteğe bağlı)<input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Ürün ara…" /></label>
      </div>
      {aday.length > 0 && <div className="by-chipler">{aday.map((u) => <button type="button" key={u.ad} onClick={() => { setUrunler((l) => [...l, u.ad]); setAra(''); }}>+ {u.ad}</button>)}</div>}
      {urunler.length > 0 && <div className="by-chipler">{urunler.map((u) => <button type="button" key={u} className="on" onClick={() => setUrunler((l) => l.filter((x) => x !== u))}>{u} ✕</button>)}</div>}
      <button type="button" className="by-btn by-ana" onClick={ekle} disabled={!ad.trim()}><Plus size={16} /> Deneyi başlat</button>
      <h4>Deneyler</h4>
      {d.deneyler.length === 0 && <div className="by-bos">Henüz deney yok.</div>}
      {d.deneyler.map((dn) => {
        const s = deneySonuc(model, dn);
        return (
          <div key={dn.id} className="by-liste-satir">
            <div>
              <b>{dn.ad}</b> <small>{tarihKisa(dn.baslangic)} · {dn.kategori || 'tüm işletme'}</small>
              <p>{s.cumle}</p>
              <p className="by-aksiyon">👉 {s.oneri}</p>
            </div>
            <button type="button" className="by-ikon" onClick={async () => { await deneySil(dn.id); onYenile(); }} aria-label="Sil"><Trash2 size={16} /></button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Birlikte satılanlar ----------------
function Sepet({ model }) {
  const l = sepetHesap(model).slice(0, 25);
  return (
    <div className="by-arac-ic">
      <p className="by-aciklama">Son 60 günün fişlerinden ({model.veri.sepet?.fis || 0} fiş). "Birlikte alma" oranı yüksek olanlar menü/tabak fikri ve kasada öneri için iyi adaylar.</p>
      {l.length === 0 && <div className="by-bos">Yeterli fiş verisi yok.</div>}
      {l.map((x) => {
        const aBuyuk = x.aIle >= x.bIle;
        const [ilk, ikinci, oran] = aBuyuk ? [x.a, x.b, x.aIle] : [x.b, x.a, x.bIle];
        return (
          <div key={`${x.a}-${x.b}`} className="by-sepet">
            <div className="by-sepet-yazi"><b>{ilk}</b> alanların <b>%{Math.round(oran * 100)}</b> kadarı <b>{ikinci}</b> ürününü de alıyor</div>
            <div className="by-sepet-cubuk"><i style={{ width: `${Math.min(100, oran * 100)}%` }} /></div>
            <small>{x.n} fişte birlikte · {x.lift >= 1.5 ? `tesadüften ${x.lift.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} kat sık` : 'ikisi de zaten çok satıyor'}</small>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Kanal, ödeme, saat ----------------
function Kanal({ d, model }) {
  const kanal = kanalHesap(model);
  const odeme = odemeHesap(model, d.ayarlar);
  const saat = saatHaritasi(model);
  const toplamOdeme = odeme.reduce((t, o) => t + o.tutar, 0);
  const komisyon = odeme.reduce((t, o) => t + o.maliyet, 0);
  return (
    <div className="by-arac-ic">
      <h4>Satış kanalları (son 30 gün)</h4>
      <table className="by-tablo">
        <thead><tr><th>Kanal</th><th className="sag">Ciro</th><th className="sag">Pay</th><th className="sag">Brüt kâr*</th><th className="sag">Marj</th></tr></thead>
        <tbody>
          {kanal.map((k) => (
            <tr key={k.ad}><td>{k.ad}</td><td className="sag">{tl(k.ciro)}</td><td className="sag">%{Math.round((k.ciro / Math.max(1, kanal.reduce((t, x) => t + x.ciro, 0))) * 100)}</td><td className="sag">{tl(k.kar)}</td><td className="sag">{yuzde(k.marj)}</td></tr>
          ))}
        </tbody>
      </table>
      <small className="by-not">* Maliyeti tanımlı ürünlerden. Online cirosu Yemeksepeti'nin yatıracağı net tutardır.</small>

      <h4>Ödeme yöntemleri (son 30 gün)</h4>
      <table className="by-tablo">
        <thead><tr><th>Yöntem</th><th className="sag">Tutar</th><th className="sag">Pay</th><th className="sag">Komisyon</th></tr></thead>
        <tbody>
          {odeme.map((o) => (
            <tr key={o.tur}><td>{o.tur}</td><td className="sag">{tl(o.tutar)}</td><td className="sag">%{Math.round((o.tutar / Math.max(1, toplamOdeme)) * 100)}</td><td className="sag">{o.tanimli ? (o.oran ? `${tl(o.maliyet)} (${yuzde(o.oran)})` : '—') : 'oran girilmedi'}</td></tr>
          ))}
        </tbody>
      </table>
      {komisyon > 0 && <p className="by-aciklama">Kart ve yemek kartı komisyonları ayda yaklaşık <b>{tl(komisyon)}</b> tutuyor.</p>}

      <h4>Saat haritası (son 8 haftanın ortalama cirosu)</h4>
      <div className="by-isi-kap">
        <table className="by-isi">
          <thead><tr><th />{saat.saatler.map((s) => <th key={s}>{s}</th>)}</tr></thead>
          <tbody>
            {GUNLER.map((g, i) => (
              <tr key={g}>
                <th>{g}</th>
                {saat.saatler.map((s) => {
                  const c = saat.h.get(`${i + 1}-${s}`) || 0;
                  const o = saat.max ? c / saat.max : 0;
                  return <td key={s} className={o > 0.55 ? 'by-isi-koyu' : ''} style={{ background: `rgba(233,79,55,${0.06 + o * 0.94})` }} title={`${g} ${s}:00 · ${tl(c)}`}>{c >= 1000 ? `${(Math.round(c / 100) / 10).toLocaleString('tr-TR')}b` : Math.round(c)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small className="by-not">Rakamlar ₺ (b = bin). Koyu kutular en yoğun saatler: hazırlık ve personel planı buna göre.</small>
    </div>
  );
}

// ---------------- Fiyat bekçisi ----------------
function Fiyat({ d, model, onAc }) {
  const kullanim = malzemeKullanimi(model);
  const liste = d.malzemeler
    .filter((m) => m.tur !== 'ambalaj')
    .map((m) => ({ m, aylik: (kullanim.get(Number(m.id)) || 0) * birimMaliyet(m) }))
    .sort((a, b) => b.aylik - a.aylik);
  const toplam = liste.reduce((t, x) => t + x.aylik, 0);
  return (
    <div className="by-arac-ic">
      <p className="by-aciklama">Online Sipariş &gt; Malzemeler'de bir fiyatı değiştirdiğin an buraya kaydedilir ve etkisi tespit kartı olarak gelir. Aşağıda malzemelerin aylık maliyetteki ağırlığı var: en üsttekilerin fiyatını sık kontrol et.</p>
      <h4>Son fiyat değişiklikleri</h4>
      {d.fiyatGecmisi.length === 0 && <div className="by-bos">Henüz kayıt yok (bugünden itibaren tutuluyor).</div>}
      {d.fiyatGecmisi.slice(0, 20).map((f) => {
        const m = model.malzMap.get(Number(f.malzeme_id));
        return <div key={f.id} className="by-liste-satir"><div><b>{m?.ad || f.malzeme_id}</b> {tl2(f.eski_fiyat)} → {tl2(f.yeni_fiyat)} <small>{String(f.zaman).slice(0, 10)}</small></div></div>;
      })}
      <h4>Malzemelerin aylık maliyet ağırlığı (toplam ~{tl(toplam)})</h4>
      <table className="by-tablo">
        <thead><tr><th>Malzeme</th><th className="sag">Fiyat</th><th className="sag">Aylık</th><th className="sag">Pay</th><th /></tr></thead>
        <tbody>
          {liste.map(({ m, aylik }) => (
            <tr key={m.id}>
              <td>{m.ad}</td>
              <td className="sag">{tl2(m.fiyat)}{m.fiyat_turu === 'kg' ? '/kg' : ''}</td>
              <td className="sag">{tl(aylik)}</td>
              <td className="sag">%{toplam ? Math.round((aylik / toplam) * 100) : 0}</td>
              <td><button type="button" className="by-btn by-hafif" onClick={() => onAc({ id: 'simulator' })}>Simüle et</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Alımlar ve fire ----------------
function Alim({ d, model, onYenile }) {
  const [tarih, setTarih] = useState(bugunIso(model));
  const [mid, setMid] = useState(String(d.malzemeler.find((m) => m.tur !== 'ambalaj')?.id || ''));
  const [miktar, setMiktar] = useState('');
  const [tutar, setTutar] = useState('');
  const [mesaj, setMesaj] = useState('');
  const m = model.malzMap.get(Number(mid));
  const fire = fireHesap(model, d.alimlar);
  const kaydet = async () => {
    if (!sayi(miktar) || !sayi(tutar)) return;
    try {
      await alimEkle({ tarih, malzeme_id: mid, miktar: sayi(miktar), tutar: sayi(tutar) });
      setMiktar(''); setTutar(''); setMesaj('Kaydedildi');
      onYenile();
    } catch (e) {
      setMesaj(e.message);
    }
  };
  return (
    <div className="by-arac-ic">
      <p className="by-aciklama">Manavdan, toptancıdan aldığın malları kilo (ya da adet) ve ödediğin tutarla gir. Satışlardan "kullanılması gereken" miktar hesaplanır; aradaki fark fire, israf ya da kayıptır. Ortalama alım fiyatı listedekinden farklıysa da uyarırım. En az 2 haftalık alım girince sonuç anlamlı olur.</p>
      <div className="by-form">
        <label>Tarih<input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} /></label>
        <label>Malzeme
          <select value={mid} onChange={(e) => setMid(e.target.value)}>
            {d.malzemeler.filter((x) => x.tur !== 'ambalaj').map((x) => <option key={x.id} value={x.id}>{x.ad}</option>)}
          </select>
        </label>
        <label>Miktar ({m?.fiyat_turu === 'kg' ? 'kg' : 'adet'})<input inputMode="decimal" value={miktar} onChange={(e) => setMiktar(e.target.value)} /></label>
        <label>Ödenen tutar (₺)<input inputMode="decimal" value={tutar} onChange={(e) => setTutar(e.target.value)} /></label>
      </div>
      <button type="button" className="by-btn by-ana" onClick={kaydet} disabled={!sayi(miktar) || !sayi(tutar)}><Save size={16} /> Alımı kaydet</button>
      {mesaj && <small className="by-not">{mesaj}</small>}

      <h4>Fire analizi (son 8 hafta)</h4>
      {fire.length === 0 && <div className="by-bos">Henüz alım girilmedi.</div>}
      {fire.length > 0 && (
        <table className="by-tablo">
          <thead><tr><th>Malzeme</th><th className="sag">Alınan</th><th className="sag">Satışa göre</th><th className="sag">Fark</th><th className="sag">Ort. fiyat</th></tr></thead>
          <tbody>
            {fire.map((f) => (
              <tr key={f.malzeme.id}>
                <td>{f.malzeme.ad} <small>{tarihKisa(f.bas)} tarihinden beri</small></td>
                <td className="sag">{f.alinan.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} {f.birim}</td>
                <td className="sag">{f.teorik.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} {f.birim}</td>
                <td className={`sag ${f.fireOran > 0.15 ? 'by-kotu-y' : ''}`}>{yuzde(f.fireOran)}{f.fireTutar > 0 ? ` · ${tl(f.fireTutar)}` : ''}</td>
                <td className="sag">{f.ortFiyat ? tl2(f.ortFiyat) : '—'} <small>liste {tl2(f.malzeme.fiyat)}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h4>Girilen alımlar</h4>
      {d.alimlar.slice(0, 40).map((a) => {
        const x = model.malzMap.get(Number(a.malzeme_id));
        return (
          <div key={a.id} className="by-liste-satir">
            <div><b>{x?.ad}</b> {Number(a.miktar).toLocaleString('tr-TR')} {x?.fiyat_turu === 'kg' ? 'kg' : 'adet'} · {tl2(a.tutar)} <small>{a.tarih}</small></div>
            <button type="button" className="by-ikon" onClick={async () => { await alimSil(a.id); onYenile(); }} aria-label="Sil"><Trash2 size={16} /></button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- Eşleştirme ----------------
function Eslestirme({ d, model, setD, baslangic }) {
  const [filtre, setFiltre] = useState(baslangic ? 'hepsi' : 'sira');
  const [ara, setAra] = useState('');
  const [secili, setSecili] = useState(baslangic || null);
  const eslMap = new Map(d.eslestirme.map((e) => [e.urun_ad, e]));
  const satilan = model.urunListe.slice().sort((a, b) => b.ciro - a.ciro);
  const sira = receteSirasi(model);
  const kaynakListe = filtre === 'sira' ? sira : satilan.filter((u) => (filtre === 'eksik' ? !u.eslesti : filtre === 'tanimli' ? u.eslesti : true));
  const liste = kaynakListe.filter((u) => !ara || u.ad.toLocaleLowerCase('tr').includes(ara.toLocaleLowerCase('tr')));
  return (
    <div className="by-arac-ic">
      <p className="by-aciklama">Her ürünün içinde hangi malzemeden kaç birim olduğu. Maliyetler buradan ve Online Sipariş malzeme listesindeki kg fiyatlarından hesaplanır. Malzemesi listede olmayan ürünlere (içecek, bal-kaymak…) elle maliyet yazabilirsin.</p>
      <div className="by-form">
        <label>Göster
          <select value={filtre} onChange={(e) => setFiltre(e.target.value)}>
            <option value="sira">Reçete sırası (yemekler hariç)</option>
            <option value="eksik">Maliyeti olmayanlar</option>
            <option value="tanimli">Maliyeti olanlar</option>
            <option value="hepsi">Hepsi</option>
          </select>
        </label>
        <label>Ara<input value={ara} onChange={(e) => setAra(e.target.value)} placeholder="Ürün adı…" /></label>
      </div>
      {filtre === 'sira' && (
        <p className="by-aciklama">Maliyeti hesaplanabilen satış (yemekler hariç) şu an <b>%{Math.round(model.kapsama.yemeksizOran * 100)}</b>. Listeyi yukarıdan aşağı doldurdukça son sütundaki orana çıkar. Yemekler şimdilik kapsam dışı.</p>
      )}
      {secili && <EslestirmeDuzenle key={secili} urunAd={secili} kayit={eslMap.get(secili)} d={d} model={model} setD={setD} onKapat={() => setSecili(null)} />}
      <table className="by-tablo">
        <thead><tr><th>Ürün</th><th>Grup</th><th className="sag">4 hafta ciro</th><th className="sag">{filtre === 'sira' ? 'Girilince kapsam' : 'Maliyet'}</th><th className="sag">Marj</th></tr></thead>
        <tbody>
          {liste.slice(0, 150).map((u) => (
            <tr key={u.ad} className="by-tikla" onClick={() => setSecili(u.ad)}>
              <td>{u.ad} <small>{u.k}</small></td>
              <td>{GRUPLAR[u.grup]}{u.grupElle ? ' ✎' : ''}</td>
              <td className="sag">{tl(u.ciro)}</td>
              <td className="sag">{filtre === 'sira' ? `%${Math.round(u.sonrakiOran * 100)}` : u.eslesti ? tl2(u.birim) : <span className="by-kotu-y">tanımsız</span>}</td>
              <td className="sag">{yuzde(u.marj)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EslestirmeDuzenle({ urunAd, kayit, d, model, setD, onKapat }) {
  const [kalemler, setKalemler] = useState(() => (kayit?.kalemler || []).map((k) => ({ m: String(k.m), a: String(k.a) })));
  const [hazir, setHazir] = useState(kayit?.hazir || '');
  const [sabit, setSabit] = useState(kayit?.sabit_maliyet === null || kayit?.sabit_maliyet === undefined ? '' : String(kayit.sabit_maliyet));
  const urun = model.urunMap.get(urunAd);
  const [grup, setGrup] = useState(kayit?.grup || '');
  const [birlesik, setBirlesik] = useState(kayit?.birlesik_ad || '');
  const [mesaj, setMesaj] = useState('');
  const toplam = hazir ? null : kalemler.reduce((t, k) => t + sayi(k.a) * birimMaliyet(model.malzMap.get(Number(k.m))), 0) + sayi(sabit);
  const kaydet = async () => {
    const satir = { urun_ad: urunAd, kalemler: hazir ? [] : kalemler.filter((k) => sayi(k.a) > 0).map((k) => ({ m: Number(k.m), a: sayi(k.a) })), hazir: hazir || null, sabit_maliyet: sabit === '' ? null : sayi(sabit), grup: grup || null, birlesik_ad: birlesik.trim() || null };
    try {
      await eslestirmeKaydet(satir);
      setD((o) => ({ ...o, eslestirme: [...o.eslestirme.filter((e) => e.urun_ad !== urunAd), satir] }));
      setMesaj('Kaydedildi');
    } catch (e) {
      setMesaj(e.message);
    }
  };
  const sil = async () => {
    await eslestirmeSil(urunAd);
    setD((o) => ({ ...o, eslestirme: o.eslestirme.filter((e) => e.urun_ad !== urunAd) }));
    onKapat();
  };
  return (
    <div className="by-duzenle">
      <div className="by-duzenle-bas"><b>{urunAd}</b><button type="button" className="by-ikon" onClick={onKapat} aria-label="Kapat"><X size={18} /></button></div>
      <label className="by-tek">Rapor grubu
        <select value={grup} onChange={(e) => setGrup(e.target.value)}>
          <option value="">Otomatik ({GRUPLAR[varsayilanGrup(urunAd, urun?.k)]})</option>
          <option value="menu">{GRUPLAR.menu}</option>
          <option value="ek">{GRUPLAR.ek}</option>
          <option value="malzeme">{GRUPLAR.malzeme}</option>
        </select>
      </label>
      <label className="by-tek">Birleşik ad (kategori tablosunda küçük/büyük boyların toplandığı ad)
        <input value={birlesik} onChange={(e) => setBirlesik(e.target.value)} placeholder="Boş bırakırsan otomatik (malzeme adı)" />
      </label>
      <label className="by-tek">Hazır sandviç reçetesi (Online Sipariş'ten)
        <select value={hazir} onChange={(e) => setHazir(e.target.value)}>
          <option value="">— Kullanma, malzemeleri aşağıda gir —</option>
          {d.sandvicler.flatMap((s) => [
            <option key={`${s.ad}|normal`} value={`${s.ad}|normal`}>{s.ad} (küçük)</option>,
            <option key={`${s.ad}|buyuk`} value={`${s.ad}|buyuk`}>{s.ad} (büyük)</option>,
          ])}
        </select>
      </label>
      {!hazir && (
        <>
          <table className="by-tablo">
            <tbody>
              {kalemler.map((k, i) => (
                <tr key={i}>
                  <td>
                    <select value={k.m} onChange={(e) => setKalemler((l) => l.map((x, j) => (j === i ? { ...x, m: e.target.value } : x)))}>
                      {d.malzemeler.map((m) => <option key={m.id} value={m.id}>{m.ad} ({m.birim_adi || 'birim'})</option>)}
                    </select>
                  </td>
                  <td className="sag"><input className="by-kisa" inputMode="decimal" value={k.a} onChange={(e) => setKalemler((l) => l.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} /></td>
                  <td className="sag">{tl2(sayi(k.a) * birimMaliyet(model.malzMap.get(Number(k.m))))}</td>
                  <td><button type="button" className="by-ikon" onClick={() => setKalemler((l) => l.filter((_, j) => j !== i))} aria-label="Sil"><Trash2 size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="by-btn" onClick={() => setKalemler((l) => [...l, { m: String(d.malzemeler[0]?.id), a: '1' }])}><Plus size={16} /> Malzeme ekle</button>
          <label className="by-tek">Elle maliyet / ek maliyet (₺)<input inputMode="decimal" value={sabit} onChange={(e) => setSabit(e.target.value)} placeholder="ör. içecek alış fiyatı" /></label>
        </>
      )}
      <div className="by-satir-btn">
        {toplam !== null && <b>Birim maliyet: {tl2(toplam)}</b>}
        <button type="button" className="by-btn by-ana" onClick={kaydet}><Save size={16} /> Kaydet</button>
        {kayit && <button type="button" className="by-btn by-hafif" onClick={sil}><Trash2 size={16} /> Eşleştirmeyi sil</button>}
        {mesaj && <small className="by-not">{mesaj}</small>}
      </div>
    </div>
  );
}

// ---------------- Notlar ----------------
function Notlar({ d, model, onYenile }) {
  const [tarih, setTarih] = useState(bugunIso(model));
  const [bitis, setBitis] = useState('');
  const [metin, setMetin] = useState('');
  const ekle = async () => {
    if (!metin.trim()) return;
    await notEkle({ tarih, bitis: bitis || null, metin: metin.trim() });
    setMetin(''); setBitis('');
    onYenile();
  };
  return (
    <div className="by-arac-ic">
      <p className="by-aciklama">Anormal günleri açıkla: "inşaat ekibi geliyordu", "bayram", "yağmur", "kampanya". Trend kartları bu notları gösterir; sebep bilinince boşuna alarm çalmaz.</p>
      <div className="by-form">
        <label>Başlangıç<input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} /></label>
        <label>Bitiş (isteğe bağlı)<input type="date" value={bitis} onChange={(e) => setBitis(e.target.value)} /></label>
        <label className="by-genis">Not<input value={metin} onChange={(e) => setMetin(e.target.value)} placeholder="Ne oldu?" /></label>
      </div>
      <button type="button" className="by-btn by-ana" onClick={ekle} disabled={!metin.trim()}><Plus size={16} /> Not ekle</button>
      <h4>Notlar</h4>
      {d.notlar.length === 0 && <div className="by-bos">Henüz not yok.</div>}
      {d.notlar.map((n) => (
        <div key={n.id} className="by-liste-satir">
          <div><small>{n.tarih}{n.bitis ? ` → ${n.bitis}` : ''}</small> <b>{n.metin}</b></div>
          <button type="button" className="by-ikon" onClick={async () => { await notSil(n.id); onYenile(); }} aria-label="Sil"><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  );
}

// ---------------- Ayarlar ----------------
function Ayarlar({ d, model, setD }) {
  const a = d.ayarlar || {};
  const ilk = (v, carp = 1) => (v === null || v === undefined ? '' : String(Math.round(Number(v) * carp * 100) / 100));
  const [hedef, setHedef] = useState(ilk(a.aylik_hedef));
  const [sabit, setSabit] = useState(ilk(a.aylik_sabit_gider));
  const [gun, setGun] = useState(String(a.calisma_gunu || 26));
  const [kart, setKart] = useState(ilk(a.kart_komisyon, 100));
  const [yemek, setYemek] = useState(ilk(a.yemek_komisyon, 100));
  const [katMarj, setKatMarj] = useState(() => Object.fromEntries(Object.entries(a.kategori_marj || {}).map(([k, v]) => [k, String(Math.round(Number(v) * 1000) / 10)])));
  const kategoriler = [...model.kategoriler.values()]
    .map((k) => ({ k: k.k, ciro: model.son4.reduce((t, h) => t + (k.hafta.get(h)?.c || 0), 0), marj: k.marj, kapsama: k.kapsama }))
    .filter((k) => k.ciro > 0)
    .sort((x, y) => y.ciro - x.ciro);
  const [mesaj, setMesaj] = useState('');
  const bos = (v, bol = 1) => (String(v).trim() === '' ? null : sayi(v) / bol);
  const kaydet = async () => {
    const km = {};
    Object.entries(katMarj).forEach(([k, v]) => { if (String(v).trim() !== '') km[k] = sayi(v) / 100; });
    const alanlar = { aylik_hedef: bos(hedef), aylik_sabit_gider: bos(sabit), calisma_gunu: Math.max(1, Math.min(31, Math.round(sayi(gun) || 26))), kart_komisyon: bos(kart, 100), yemek_komisyon: bos(yemek, 100), kategori_marj: km };
    try {
      await ayarKaydet(alanlar);
      setD((o) => ({ ...o, ayarlar: { ...o.ayarlar, ...alanlar } }));
      setMesaj('Kaydedildi');
    } catch (e) {
      setMesaj(e.message);
    }
  };
  return (
    <div className="by-arac-ic">
      <div className="by-form">
        <label>Aylık brüt kâr hedefi (₺)<input inputMode="decimal" value={hedef} onChange={(e) => setHedef(e.target.value)} placeholder="ör. 250000" /></label>
        <label>Aylık sabit giderler (₺)<input inputMode="decimal" value={sabit} onChange={(e) => setSabit(e.target.value)} placeholder="kira + maaş + fatura…" /></label>
        <label>Ayda çalışılan gün<input inputMode="numeric" value={gun} onChange={(e) => setGun(e.target.value)} /></label>
        <label>Kredi kartı komisyonu (%)<input inputMode="decimal" value={kart} onChange={(e) => setKart(e.target.value)} placeholder="ör. 2,5" /></label>
        <label>Yemek kartı komisyonu (%)<input inputMode="decimal" value={yemek} onChange={(e) => setYemek(e.target.value)} placeholder="ör. 8" /></label>
      </div>
      <h4>Kategori bazında tahmini marj</h4>
      <p className="by-aciklama"><b>Dikkat: buraya yazdığın oran ürün maliyetinden HESAPLANMAZ, senin tahminindir.</b> Ekranda "elle girilen tahmini marj" olarak ayrıca gösterilir. Ürünleri tek tek eşleştirmediğin kategoriler (yemekler, içecekler…) için yaklaşık marjı yaz; kâr, hedef ve başabaş bu kategorileri de hesaba katsın. Boş bırakırsan maliyeti bilinen ürünlerden hesaplanır.</p>
      <table className="by-tablo">
        <thead><tr><th>Kategori</th><th className="sag">4 hafta ciro</th><th className="sag">Hesaplanan</th><th className="sag">Elle tahmini marj (%)</th></tr></thead>
        <tbody>
          {kategoriler.map((k) => (
            <tr key={k.k}>
              <td>{k.k}</td>
              <td className="sag">{tl(k.ciro)}</td>
              <td className="sag">{k.marj !== null && k.kapsama >= 0.3 ? `${yuzde(k.marj)} (%${Math.round(k.kapsama * 100)} kapsam)` : '—'}</td>
              <td className="sag"><input className="by-kisa" inputMode="decimal" value={katMarj[k.k] ?? ''} onChange={(e) => setKatMarj((o) => ({ ...o, [k.k]: e.target.value }))} placeholder="—" /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="by-btn by-ana" onClick={kaydet}><Save size={16} /> Kaydet</button>
      {mesaj && <small className="by-not">{mesaj}</small>}
      <p className="by-aciklama">"Brüt kâr" = satış − malzeme maliyeti. Kira, maaş gibi sabit giderler bundan sonra düşülür; başabaş çubuğu bunu takip eder.</p>
    </div>
  );
}

function KartDetay({ t, d, model, setD, onAc }) {
  return (
    <div className="by-arac-ic">
      <div className={`by-kart by-kart-ic`}>
        <h3>{t.baslik}</h3>
        <p>{t.cumle}</p>
        <p className="by-aksiyon">👉 {t.aksiyon}{t.not ? ` (${t.not})` : ''}</p>
      </div>
      {(t.kural || t.kaynak || t.hesap) && (
        <div className="by-seffaf">
          {t.kural && (<><b>Kural</b><span>{t.kural}</span></>)}
          {t.kaynak && (<><b>Veri kaynağı</b><span>{t.kaynak}</span></>)}
          {t.hesap && (<><b>Hesap</b><span>{t.hesap}</span></>)}
          <b>"Gördüm"</b><span>Kart bu 4 haftalık dönem için kapanır. Durum değişirse, etkisi %50'den fazla büyürse ya da yeni dönem başlarsa tekrar gelir.</span>
        </div>
      )}
      {t.detay?.tip === 'supheli' && <Supheli d={d} setD={setD} />}
      <div className="by-satir-btn">
        {t.urun && <button type="button" className="by-btn by-ana" onClick={() => onAc({ id: 'urun', urun: t.urun })}>Ürün detayı</button>}
        {t.urun && model.urunMap.get(t.urun)?.eslesti && !model.urunMap.get(t.urun)?.sanal && <button type="button" className="by-btn" onClick={() => onAc({ id: 'simulator', urun: t.urun })}>Simülatörde dene</button>}
        {t.detay?.tip === 'arac' && <button type="button" className="by-btn by-ana" onClick={() => onAc({ id: t.detay.arac })}>{BASLIK[t.detay.arac]} ekranını aç</button>}
      </div>
    </div>
  );
}

export default function BeyinArac({ arac, d, model, setD, onKapat, onAc, onYenile }) {
  let icerik = null;
  if (arac.id === 'kategori') icerik = <Kategori k={arac.k} d={d} model={model} setD={setD} />;
  else if (arac.id === 'kart') icerik = <KartDetay t={arac.kart} d={d} model={model} setD={setD} onAc={onAc} />;
  else if (arac.id === 'urun') icerik = <UrunDetay model={model} urun={arac.urun} onAc={onAc} />;
  else if (arac.id === 'supheli') icerik = <Supheli d={d} setD={setD} />;
  else if (arac.id === 'simulator') icerik = <Simulator model={model} baslangic={arac.urun} />;
  else if (arac.id === 'deney') icerik = <Deneyler d={d} model={model} onYenile={onYenile} />;
  else if (arac.id === 'sepet') icerik = <Sepet model={model} />;
  else if (arac.id === 'kanal') icerik = <Kanal d={d} model={model} />;
  else if (arac.id === 'fiyat') icerik = <Fiyat d={d} model={model} onAc={onAc} />;
  else if (arac.id === 'alim') icerik = <Alim d={d} model={model} onYenile={onYenile} />;
  else if (arac.id === 'eslestirme') icerik = <Eslestirme d={d} model={model} setD={setD} baslangic={arac.urun} />;
  else if (arac.id === 'notlar') icerik = <Notlar d={d} model={model} onYenile={onYenile} />;
  else if (arac.id === 'ayarlar') icerik = <Ayarlar d={d} model={model} setD={setD} />;
  return (
    <div className="by-perde" onClick={onKapat} role="presentation">
      <div className="by-pencere" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header>
          <h2>{arac.id === 'urun' ? arac.urun : arac.id === 'kategori' ? arac.k : BASLIK[arac.id]}</h2>
          <button type="button" className="by-ikon" onClick={onKapat} aria-label="Kapat"><X size={22} /></button>
        </header>
        <div className="by-pencere-govde">{icerik}</div>
      </div>
    </div>
  );
}
