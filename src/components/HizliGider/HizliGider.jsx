import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trash2, Lock, Plus, Check, X, AlertTriangle, Building2, PencilLine, UserRound, CalendarClock, Coins, Wallet } from 'lucide-react';
import { TL } from '../../hooks/useHipposData';
import './HizliGider.css';

// Harcama paneli (hızlı gider): Ayarlar ve Gün Sonu sayfasında AYNI bileşen, AYNI kayıtlar (Muhasebe2 defteri).
// Günlük kasadan = çekmeceden ödenen (Gün Sonu nakit ciroya geri eklenir), Ana kasadan = TL Kasa'dan ödenen (rapor).
// Satır türleri: cari (mavi), serbest (amber), personel avansı / sabit gider ödemesi (mor, fiş yok), başka formdan gelen (gri, kilitli).

async function api2(resource, { method = 'GET', body, query } = {}) {
  const qs = new URLSearchParams({ resource, ...(query || {}) });
  const res = await fetch(`/api/muhasebe2?${qs}`, method === 'GET' ? undefined : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  let j = null;
  try { j = await res.json(); } catch { /* boş yanıt */ }
  if (!res.ok) throw new Error((j && j.error) || 'İşlem yapılamadı');
  return j;
}

const BOS = { tarih: '', gunlukKasa: [], anaKasa: [], gunlukKasaToplam: 0, anaKasaToplam: 0, cariler: [], sikCariler: [], sikSerbest: [], kategoriler: [], kapali: false, kayitliGunlukToplam: null, kayitliSaat: '', varsayilanKategori: 'Diğer Giderler', yuklendi: false };

// İki ekranın ortak verisi. Sunucudan gelen veri yalnızca bu listeyi günceller; yazılmakta olan satırlara hiç dokunmaz.
export function useHizliGider() {
  const [veri, setVeri] = useState(BOS);
  const sira = useRef(0);
  const yenile = useCallback(async () => {
    const n = ++sira.current;
    try {
      const j = await api2('hizliGiderListe');
      if (n === sira.current) setVeri({ ...BOS, ...j, yuklendi: true });
    } catch { /* ağ hatası ekranı kilitlemesin */ }
  }, []);
  useEffect(() => {
    yenile();
    const odak = () => yenile();
    window.addEventListener('focus', odak);
    return () => window.removeEventListener('focus', odak);
  }, [yenile]);
  return { ...veri, yenile };
}

const norm = (s) => String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function sayiCoz(v) {
  const t = String(v ?? '').trim().replace(/\s/g, '');
  const n = t.includes(',') ? parseFloat(t.replace(/\./g, '').replace(',', '.')) : parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}
const renk = (tur) => (tur === 'cari' ? 'hg-c' : tur === 'serbest' ? 'hg-s' : tur === 'personel' || tur === 'sabit' ? 'hg-p' : 'hg-k');
const ETIKET = { cari: 'Cari', serbest: 'Serbest', personel: 'Avans / maaş ödemesi', sabit: 'Sabit gider ödemesi' };
const IKON = { cari: Building2, serbest: PencilLine, personel: UserRound, sabit: CalendarClock };
function Rozet({ tur, metin, kisa }) {
  const Ikon = IKON[tur] || Lock;
  // Düzenlerken yer kazanmak için yalnızca simge (tür rengi ve ipucu yeterli)
  if (kisa) return <span className="hg-rb hg-rbk" title={metin}><Ikon size={13} aria-hidden="true" /></span>;
  return <span className="hg-rb"><Ikon size={12} aria-hidden="true" />{metin}</span>;
}

export default function HizliGider({ hg }) {
  const [onay, setOnay] = useState(null);
  const [toast, setToast] = useState(null);
  const zaman = useRef(null);
  const bildir = useCallback((mesaj, geriAl) => {
    clearTimeout(zaman.current);
    setToast({ mesaj, geriAl });
    zaman.current = setTimeout(() => setToast(null), geriAl ? 8000 : 3000);
  }, []);
  useEffect(() => () => clearTimeout(zaman.current), []);

  const guncelDegil = hg.kapali && hg.kayitliGunlukToplam !== null && Math.abs(hg.kayitliGunlukToplam - hg.gunlukKasaToplam) > 0.004;

  return (
    <div className="hg-wrap">
      <Blok baslik="Günlük kasadan harcamalar" ipucu="ciroya geri eklenir" kasaGrubu="gunluk" satirlar={hg.gunlukKasa} toplam={hg.gunlukKasaToplam} toplamEtiket="GÜNLÜK KASA TOPLAMI" hg={hg} bildir={bildir} onayIste={setOnay} />
      {guncelDegil && (
        <div className="hg-uyari" role="status">
          <AlertTriangle size={14} />
          <span>Gün Sonu kaydedildikten sonra günlük harcama değişti (kayıtlı {TL(hg.kayitliGunlukToplam)}, güncel {TL(hg.gunlukKasaToplam)}). Gün Sonu sayfasında Kaydet'e basınca güncellenir.</span>
        </div>
      )}
      <Blok baslik="Ana kasadan harcamalar" ipucu="Gün Sonu'nu etkilemez, rapor" kasaGrubu="ana" satirlar={hg.anaKasa} toplam={hg.anaKasaToplam} toplamEtiket="ANA KASA TOPLAMI" hg={hg} bildir={bildir} onayIste={setOnay} />
      {onay && (
        <div className="hg-ort" onClick={() => setOnay(null)}>
          <div className="hg-dlg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>{onay.tur === 'personel' ? 'Gider değil, avans / maaş ödemesi' : 'Gider değil, sabit gider ödemesi'}</h3>
            <p>
              {onay.ad} için {TL(onay.tutar)} ödeme yapılacak. {onay.tur === 'personel' ? 'Maaş gideri ay sonunda tahakkukla yazılır.' : 'Sabit giderin kendisi ay sonunda tahakkukla yazılır.'} Şimdi fiş açarsak aynı {onay.tur === 'personel' ? 'maaş' : 'gider'} iki kez gider görünürdü.
            </p>
            <p>Bu yüzden fiş/fatura açılmaz, yalnız ödeme makbuzu kesilir.</p>
            <div className="hg-ab">
              <button type="button" className="hg-bt" onClick={() => setOnay(null)}>Vazgeç</button>
              <button type="button" className="hg-bt hg-go" onClick={() => { const d = onay.devam; setOnay(null); d(); }}>Evet, makbuz kes</button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="hg-toast" role="status">
          <span>{toast.mesaj}</span>
          {toast.geriAl && <button type="button" onClick={() => { const g = toast.geriAl; setToast(null); g(); }}>Geri al</button>}
        </div>
      )}
    </div>
  );
}

function Blok({ baslik, ipucu, kasaGrubu, satirlar, toplam, toplamEtiket, hg, bildir, onayIste }) {
  const [duzen, setDuzen] = useState(null);
  const [silOnay, setSilOnay] = useState(null);
  const [anahtar, setAnahtar] = useState(0);
  const [yeniCari, setYeniCari] = useState(null); // { ad, kategori } | null
  const [onsecim, setOnsecim] = useState(null);

  async function sil(s) {
    setSilOnay(null);
    try {
      let geriAl;
      if (s.tur === 'personel') {
        await api2('avansSil', { method: 'POST', body: { id: s.avansId } });
        geriAl = () => api2('avansKaydet', { method: 'POST', body: { personelId: s.personelId, tarih: hg.tarih, tutar: s.tutar, odemeTuru: 'Nakit', kasa: 'TL Kasa', aciklama: s.aciklama, kasaGrubu: s.kasaGrubu } });
      } else {
        const j = await api2('hizliGiderSil', { method: 'POST', body: { id: s.id } });
        geriAl = () => api2('hizliGiderGeriYaz', { method: 'POST', body: { faturalar: j.oncesi.faturalar, makbuzlar: j.oncesi.makbuzlar } });
      }
      await hg.yenile();
      bildir(`${s.ad} silindi`, async () => {
        try { await geriAl(); await hg.yenile(); bildir('Geri alındı'); } catch (e) { bildir(e.message); }
      });
    } catch (e) {
      bildir(e.message);
    }
  }

  async function cariAc() {
    const ad = (yeniCari.ad || '').trim();
    if (!ad) return;
    try {
      const j = await api2('firmaEkle', { method: 'POST', body: { ad, varsayilanKategori: yeniCari.kategori } });
      await hg.yenile();
      setOnsecim({ id: j.firma.id, ad: j.firma.ad, tur: 'cari', kategori: j.firma.varsayilan_kategori, t: Date.now() });
      setYeniCari(null);
      bildir(`${ad} carisi açıldı`);
    } catch (e) {
      bildir(e.message);
    }
  }

  return (
    <div className="hg-blok">
      <div className="hg-bh">
        <span className="hg-bs">{kasaGrubu === 'gunluk' ? <Coins size={15} aria-hidden="true" /> : <Wallet size={15} aria-hidden="true" />}{baslik}</span>
        <span className="hg-tp" title={toplamEtiket}><strong>{TL(toplam)}</strong></span>
      </div>
      <div className="hg-bh2">
        <small className="hg-ipucu">{ipucu}</small>
        <button type="button" className="hg-yc" onClick={() => setYeniCari({ ad: '', kategori: '' })}><Plus size={12} />Yeni cari</button>
      </div>
      {yeniCari && (
        <div className="hg-nc">
          <input autoFocus placeholder="Cari adı" value={yeniCari.ad} onChange={(e) => setYeniCari({ ...yeniCari, ad: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') cariAc(); if (e.key === 'Escape') setYeniCari(null); }} />
          <select value={yeniCari.kategori} onChange={(e) => setYeniCari({ ...yeniCari, kategori: e.target.value })}>
            <option value="">Kategori seç</option>
            {hg.kategoriler.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <button type="button" className="hg-bt hg-go" onClick={cariAc}>Kaydet</button>
          <button type="button" className="hg-bt" onClick={() => setYeniCari(null)}>Vazgeç</button>
        </div>
      )}
      {satirlar.map((s) => {
        if (duzen === s.id) {
          return <GirisSatiri key={s.id} hg={hg} kasaGrubu={kasaGrubu} satir={s} onBitti={() => setDuzen(null)} onIptal={() => setDuzen(null)} bildir={bildir} onayIste={onayIste} onYeniCari={(ad) => setYeniCari({ ad, kategori: '' })} />;
        }
        if (silOnay === s.id) {
          return (
            <div key={s.id} className="hg-cf">
              <span>{s.ad} {TL(s.tutar)} silinsin mi? {s.tur === 'personel' ? 'Avans makbuzu silinir, personel carisi eski haline döner.' : s.tur === 'sabit' ? 'Ödeme makbuzu silinir.' : 'Fiş ve ödeme makbuzu birlikte silinir.'}</span>
              <span className="hg-cfb"><button type="button" className="hg-bt" onClick={() => setSilOnay(null)}>Vazgeç</button><button type="button" className="hg-bt hg-dn" onClick={() => sil(s)}>Sil</button></span>
            </div>
          );
        }
        return (
          <div key={s.id} className={`hg-r ${renk(s.tur)} ${s.kilitli ? 'hg-kilit' : 'hg-tikla'}`} onClick={() => !s.kilitli && setDuzen(s.id)} title={s.kilitli ? `${s.kilitEtiketi} düzenlenir` : 'Düzeltmek için tıkla'}>
            <span className="hg-n"><Rozet tur={s.kilitli ? 'kilit' : s.tur} metin={s.kilitli ? s.kilitEtiketi : ETIKET[s.tur]} /><span className="hg-ad">{s.ad}</span>{s.aciklama && <small>{s.aciklama}</small>}</span>
            <span className="hg-t">{TL(s.tutar)}</span>
            {s.kilitli ? <span className="hg-i" aria-hidden="true"><Lock size={14} /></span> : <button type="button" className="hg-i" aria-label="Sil" onClick={(e) => { e.stopPropagation(); setSilOnay(s.id); }}><Trash2 size={14} /></button>}
          </div>
        );
      })}
      <GirisSatiri key={anahtar} hg={hg} kasaGrubu={kasaGrubu} onBitti={() => setAnahtar((n) => n + 1)} bildir={bildir} onayIste={onayIste} onsecim={onsecim} onYeniCari={(ad) => setYeniCari({ ad, kategori: '' })} />
    </div>
  );
}

function secimDen(s) {
  if (s.tur === 'serbest') return { tur: 'serbest' };
  return { tur: s.tur, firma: { id: s.firmaId, ad: s.ad, personelId: s.personelId } };
}

function GirisSatiri({ hg, kasaGrubu, satir, onBitti, onIptal, bildir, onayIste, onsecim, onYeniCari }) {
  const duzen = !!satir;
  const kilitliAd = duzen && (satir.tur === 'personel' || satir.tur === 'sabit');
  const [metin, setMetin] = useState(satir ? satir.ad : '');
  const [secim, setSecim] = useState(satir ? secimDen(satir) : null);
  const [tutar, setTutar] = useState(satir ? String(satir.tutar).replace('.', ',') : '');
  const [not, setNot] = useState(satir ? satir.aciklama || '' : '');
  const [notAcik, setNotAcik] = useState(!!(satir && satir.aciklama));
  const [kategori, setKategori] = useState((satir && satir.kategori) || hg.varsayilanKategori);
  const [kg, setKg] = useState(satir ? satir.kasaGrubu : kasaGrubu);
  const [acik, setAcik] = useState(false);
  const [aktif, setAktif] = useState(0);
  const [bekliyor, setBekliyor] = useState(false);
  const tutarRef = useRef(null);

  useEffect(() => {
    if (!onsecim) return;
    setMetin(onsecim.ad);
    setSecim({ tur: 'cari', firma: onsecim });
    setAcik(false);
    if (tutarRef.current) tutarRef.current.focus();
  }, [onsecim]);
  useEffect(() => { if (duzen && tutarRef.current) tutarRef.current.focus(); }, [duzen]);

  const tam = hg.cariler.find((c) => norm(c.ad) === norm(metin));
  const eslesen = useMemo(() => {
    const q = norm(metin);
    return q ? hg.cariler.filter((c) => norm(c.ad).includes(q)).slice(0, 7) : [];
  }, [metin, hg.cariler]);
  const secenekler = [...eslesen.map((c) => ({ t: 'cari', c })), ...(metin.trim() && !tam ? [{ t: 'serbest' }, { t: 'yeni' }] : [])];
  // Kaydederken tür: seçim > tam eşleşme > serbest. Ekranda ise eşleşen cari VARKEN seçim yapılana kadar nötr kalır.
  const tur = secim ? secim.tur : tam ? tam.tur : metin.trim() ? 'serbest' : null;
  const turGorunen = secim ? secim.tur : tam ? tam.tur : metin.trim() && eslesen.length === 0 ? 'serbest' : null;

  function sec(o) {
    if (o.t === 'cari') { setMetin(o.c.ad); setSecim({ tur: o.c.tur, firma: o.c }); }
    else if (o.t === 'serbest') setSecim({ tur: 'serbest' });
    else { onYeniCari(metin.trim()); }
    setAcik(false);
    if (o.t !== 'yeni' && tutarRef.current) tutarRef.current.focus();
  }
  function adTus(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAcik(true); setAktif((a) => Math.min(a + 1, Math.max(secenekler.length - 1, 0))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAktif((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (acik && secenekler[aktif]) sec(secenekler[aktif]); else if (tutarRef.current) tutarRef.current.focus(); }
    else if (e.key === 'Escape') { if (duzen) onIptal(); else setAcik(false); }
  }

  async function kaydet(onayli) {
    const n = sayiCoz(tutar);
    if (!(n > 0)) { bildir('Tutarı yazın'); return; }
    let t = tur;
    let firma = secim ? secim.firma : tam;
    if (secim && !secim.firma && secim.tur !== 'serbest') firma = tam;
    if (!t) { bildir('Ne için harcandığını yazın ya da cari seçin'); return; }
    if (t !== 'serbest' && !firma) { bildir('Cariyi listeden seçin'); return; }
    if (!duzen && !onayli && (t === 'personel' || t === 'sabit')) { onayIste({ tur: t, ad: firma.ad, tutar: n, devam: () => kaydet(true) }); return; }
    setBekliyor(true);
    try {
      if (t === 'personel') {
        await api2('avansKaydet', { method: 'POST', body: { id: duzen ? satir.avansId : undefined, personelId: firma.personelId, tarih: hg.tarih, tutar: n, odemeTuru: 'Nakit', kasa: 'TL Kasa', aciklama: not, kasaGrubu: kg } });
      } else {
        await api2('hizliGiderKaydet', { method: 'POST', body: { id: duzen ? satir.id : undefined, tur: t, firmaId: firma ? firma.id : undefined, ad: metin.trim(), tutar: n, aciklama: not, kasaGrubu: kg, kategori } });
      }
      await hg.yenile();
      onBitti();
    } catch (e) {
      bildir(e.message);
    } finally {
      setBekliyor(false);
    }
  }

  const etiket = turGorunen ? ETIKET[turGorunen] : null;
  const ikinci = notAcik || turGorunen === 'serbest';
  return (
    <div className={`hg-giris ${turGorunen ? renk(turGorunen) : 'hg-e'} ${duzen ? 'hg-duzen' : ''}`}>
      <div className="hg-gr">
        <div className="hg-isim">
          {etiket && <Rozet tur={turGorunen} metin={etiket} kisa={duzen} />}
          <input
            className="hg-ara"
            placeholder="Ne için? Ara..."
            value={metin}
            readOnly={kilitliAd}
            aria-label="Ne için"
            onChange={(e) => { setMetin(e.target.value); setSecim(null); setAcik(true); setAktif(0); }}
            onFocus={() => !kilitliAd && setAcik(true)}
            onBlur={() => setTimeout(() => setAcik(false), 150)}
            onKeyDown={adTus}
          />
          {acik && !kilitliAd && secenekler.length > 0 && (
            <div className="hg-dd" role="listbox">
              {secenekler.map((o, i) => (
                <button key={o.t + (o.c ? o.c.id : '')} type="button" role="option" aria-selected={i === aktif} className={`hg-di ${o.t === 'cari' ? renk(o.c.tur) : o.t === 'serbest' ? 'hg-s' : ''} ${i === aktif ? 'hg-ak' : ''}`} onMouseDown={(e) => { e.preventDefault(); sec(o); }}>
                  {o.t === 'cari' && (<><span>{o.c.ad}</span><small>{o.c.tur === 'cari' ? 'kayıtlı cari' : o.c.tur === 'personel' ? 'personel: avans / maaş ödemesi' : 'sabit gider ödemesi'}</small></>)}
                  {o.t === 'serbest' && (<><span>"{metin.trim()}" olarak serbest yaz</span><small>Enter</small></>)}
                  {o.t === 'yeni' && (<><span>"{metin.trim()}" adıyla yeni cari aç</span><small>+</small></>)}
                </button>
              ))}
            </div>
          )}
        </div>
        <input ref={tutarRef} className="hg-tu" inputMode="decimal" placeholder="0,00" aria-label="Tutar" value={tutar} onChange={(e) => setTutar(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') kaydet(); if (e.key === 'Escape' && duzen) onIptal(); }} />
        {duzen && (
          <span className="hg-sg" role="group" aria-label="Kasa">
            <button type="button" className={kg === 'gunluk' ? 'on' : ''} onClick={() => setKg('gunluk')}>Günlük</button>
            <button type="button" className={kg === 'ana' ? 'on' : ''} onClick={() => setKg('ana')}>Ana</button>
          </span>
        )}
        <button type="button" className={`hg-ib hg-notb ${notAcik ? 'on' : ''}`} title="Not ekle" aria-label="Not" onClick={() => setNotAcik((v) => !v)}>Not</button>
        <button type="button" className="hg-ib hg-ok" aria-label="Kaydet" disabled={bekliyor} onClick={() => kaydet()}><Check size={15} /></button>
        {duzen && <button type="button" className="hg-ib" aria-label="Vazgeç" onClick={onIptal}><X size={15} /></button>}
      </div>
      {(turGorunen === 'personel' || turGorunen === 'sabit') && <div className="hg-ip">Fiş/fatura açılmaz, yalnız ödeme makbuzu kesilir.</div>}
      {!duzen && !turGorunen && !metin.trim() && (hg.sikCariler.length > 0 || hg.sikSerbest.length > 0) && (
        <div className="hg-cp">
          <span>Sık kullanılan:</span>
          {hg.sikCariler.map((c) => <button key={c.id} type="button" className="hg-ch" onClick={() => sec({ t: 'cari', c })}><i className={renk(c.tur)} />{c.ad}</button>)}
          {hg.sikSerbest.map((ad) => <button key={ad} type="button" className="hg-ch" onClick={() => { setMetin(ad); setSecim({ tur: 'serbest' }); if (tutarRef.current) tutarRef.current.focus(); }}><i className="hg-s" />{ad}</button>)}
        </div>
      )}
      {ikinci && (
        <div className="hg-gr2">
          {turGorunen === 'serbest' && (
            <select value={kategori} onChange={(e) => setKategori(e.target.value)} aria-label="Kategori">
              {[...new Set([hg.varsayilanKategori, ...hg.kategoriler])].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
          {notAcik && <input className="hg-not" placeholder="Not (opsiyonel)" value={not} onChange={(e) => setNot(e.target.value)} aria-label="Not metni" />}
        </div>
      )}
    </div>
  );
}