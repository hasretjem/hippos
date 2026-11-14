import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, ClipboardPaste, Trash2, X } from 'lucide-react';
import './OnlineSatis.css';
import { olYukle } from './olVeri';
import { urunBul, yaziRengi } from './olRenk';
import { useSvgIcon } from '../../components/ProductButton';
import { resolveButtonStyle } from '../../constants/themeDefaults';
import { BUFE_AD, EKMEKLER, boyAd, bufeKalemi, ekstraKalemi, icecekKalemi, menuKalemi, menuListesi, menuSorulari, siparisNoBul } from './olSatis';

const TL0 = (n) => `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(n) || 0)} ₺`;
const SEKMELER = [
  ['menuler', 'Menüler'],
  ['ekstralar', 'Ekstralar'],
  ['icecekler', 'İçecekler'],
];
const BOYLAR = ['buyuk', 'normal'];

// Veriyi her kategori değişiminde yeniden çekmemek için kısa ömürlü önbellek.
let onbellek = null;
let onbellekZaman = 0;

// Menü düğmeleri için uyumlu zemin renkleri (her sandviç sabit bir renk alır).
const MENU_RENKLERI = ['#f4a259', '#5b8e7d', '#bc4b51', '#8cb369', '#4a6fa5', '#e9c46a', '#9b5de5', '#2a9d8f', '#d17a22', '#6d597a'];

function Dugme({ ad, fiyat, renk, yazi, ikon, rozet, onClick, sinif = '' }) {
  const bg = renk || '#f6f7eb';
  const fg = yazi || yaziRengi(bg);
  const svgDosya = typeof ikon === 'string' && ikon.endsWith('.svg') ? ikon : null;
  const svg = useSvgIcon(svgDosya);
  return (
    <button className={`pb-card os-dugme ${sinif}`} style={{ background: bg }} onClick={onClick}>
      {svgDosya && svg && <span className="pb-icon-watermark pb-icon-svg" style={{ color: fg }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />}
      {!svgDosya && ikon && <span className="pb-icon-watermark" aria-hidden="true">{ikon}</span>}
      {rozet ? <span className="os-rozet">×{rozet}</span> : null}
      <div className="pb-text-box">
        <span className="pb-name" style={{ color: fg }}>{ad}</span>
      </div>
      <span className="pb-price os-fiyat" style={{ color: fg }}>{TL0(fiyat)}</span>
    </button>
  );
}

function Ikili({ secenekler, deger, onSec }) {
  return (
    <div className="os-ikili">
      {secenekler.map(([d, etiket]) => (
        <button key={String(d)} type="button" className={deger === d ? 'on' : ''} onClick={() => onSec(d)}>
          {deger === d && <Check size={18} />} {etiket}
        </button>
      ))}
    </div>
  );
}

// Tek pencere: ekmek seçimi, alternatif ekmek, müşteri seçimli sorular, müşteri notu, sipariş no — hepsi alt alta.
function SiparisPopup({ popup, ilkSiparisNo, onKapat, onEkle }) {
  const { boy, menu } = popup;
  const sorular = useMemo(() => (menu ? menuSorulari(menu.h) : []), [menu]);
  const [ekmek, setEkmek] = useState(null);
  const [altEkmek, setAltEkmek] = useState(null);
  const [secimler, setSecimler] = useState({});
  const [not, setNot] = useState('');
  const [siparisNo, setSiparisNo] = useState(ilkSiparisNo || '');
  const [uyari, setUyari] = useState('');
  const hazir = ekmek !== null && altEkmek !== null && sorular.every((q) => secimler[q.index]);

  async function yapistir() {
    try {
      const metin = await navigator.clipboard.readText();
      if (metin && metin.trim()) setNot((n) => (n ? `${n} ${metin.trim()}` : metin.trim()));
      else setUyari('Panoda metin yok');
    } catch {
      setUyari('Panoya erişilemedi');
    }
  }

  return (
    <div className="ds-modal-overlay os-ortu" onClick={onKapat}>
      <div className="ds-modal os-popup" onClick={(e) => e.stopPropagation()}>
        <div className="os-popup-bas">
          <h3>{menu ? menu.sandvic.ad : BUFE_AD} · {boyAd(boy)}</h3>
          <button className="ds-modal-x" onClick={onKapat} aria-label="Kapat"><X size={18} /></button>
        </div>

        <div className="os-alan">
          <span className="os-etiket">Ekmek seçimi</span>
          <Ikili secenekler={EKMEKLER[boy].map((e) => [e, e])} deger={ekmek} onSec={setEkmek} />
        </div>

        <div className="os-alan">
          <span className="os-etiket">Alternatif ekmek istiyor mu?</span>
          <Ikili secenekler={[[true, 'Evet, kabul ediyor'], [false, 'Hayır, kabul etmiyor']]} deger={altEkmek} onSec={setAltEkmek} />
        </div>

        {sorular.map((q) => (
          <div className="os-alan" key={q.index}>
            <span className="os-etiket">{q.soru}</span>
            <div className="os-ikili cok">
              {q.secenekler.map((o) => (
                <button key={o.id} type="button" className={secimler[q.index] === o.id ? 'on' : ''} onClick={() => setSecimler((s) => ({ ...s, [q.index]: o.id }))}>
                  {secimler[q.index] === o.id && <Check size={18} />} {o.ad}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="os-alan">
          <span className="os-etiket">Müşteri notu</span>
          <div className="os-not">
            <textarea rows={3} placeholder="Müşterinin notu varsa buraya yaz ya da yapıştır" value={not} onChange={(e) => setNot(e.target.value)} />
            <div className="os-not-dugmeler">
              <button type="button" onClick={yapistir}><ClipboardPaste size={16} /> Yapıştır</button>
              <button type="button" className="sil" onClick={() => setNot('')}><Trash2 size={16} /> Sil</button>
            </div>
          </div>
        </div>

        <div className="os-alan">
          <span className="os-etiket">Sipariş no (isteğe bağlı)</span>
          <input className="os-sipno" inputMode="text" placeholder="Platformdaki sipariş numarası" value={siparisNo} onChange={(e) => setSiparisNo(e.target.value)} />
        </div>

        {uyari && <p className="os-uyari">{uyari}</p>}
        <div className="os-popup-alt">
          <span className="os-popup-fiyat">{menu ? TL0(menu.fiyat) : ''}</span>
          <button className="os-ekle" disabled={!hazir} onClick={() => onEkle({ ekmek, altEkmek, secimler, not, siparisNo })}>
            {hazir ? 'Ekle' : 'Ekmek ve seçimleri işaretle'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Satış ekranı > "Online sipariş" kategorisi: Menüler / Ekstralar / İçecekler.
export default function OnlineSatis({ data, draftItems, onEkle, onSiparisNo, bildir }) {
  const [veri, setVeri] = useState(() => onbellek);
  const [hata, setHata] = useState('');
  const [sekme, setSekme] = useState('menuler');
  const [popup, setPopup] = useState(null); // { boy, menu? }
  const [aktifBufe, setAktifBufe] = useState(null); // { id, boy, ekmek }
  const kolonRef = { buyuk: useRef(null), normal: useRef(null) };

  useEffect(() => {
    let iptal = false;
    if (onbellek && Date.now() - onbellekZaman < 60000) return undefined;
    olYukle()
      .then((v) => {
        onbellek = v;
        onbellekZaman = Date.now();
        if (!iptal) setVeri(v);
      })
      .catch((e) => { if (!iptal) setHata(e.message); });
    return () => { iptal = true; };
  }, []);

  // Açık büfe kalemi sepetten silindiyse şeridi kapat.
  useEffect(() => {
    if (aktifBufe && !draftItems.some((i) => i.id === aktifBufe.id)) setAktifBufe(null);
  }, [draftItems, aktifBufe]);

  const urunler = useMemo(() => (data.products || []).filter((u) => u.durum !== 'PASIF'), [data.products]);
  const sandvicUrunleri = useMemo(() => urunler.filter((u) => u.kategori === 'SOĞUK SANDVİÇ'), [urunler]);
  const urunMap = useMemo(() => new Map((data.products || []).map((u) => [u.id, u])), [data.products]);
  const kategoriMap = useMemo(() => new Map((data.categories || []).map((c) => [c.name, c])), [data.categories]);
  const menuler = useMemo(() => (veri && veri.p ? menuListesi(veri, urunMap) : { buyuk: [], normal: [] }), [veri, urunMap]);
  const ekstralar = useMemo(() => (veri?.ekstralar || []).filter((e) => e.aktif !== false), [veri]);
  // Ekstra düğmeleri Soğuk Sandviç ile aynı yerde dursun: "Sıra" = düğmenin yeri; atlanan numaralar boş kalır.
  const ekstraYerleri = useMemo(() => {
    const yerler = [];
    let sonraki = 1;
    [...ekstralar].sort((x, y) => x.sira - y.sira || x.id - y.id).forEach((e) => {
      const yer = Math.max(Math.round(Number(e.sira)) || sonraki, sonraki);
      while (yerler.length < yer - 1) yerler.push(null);
      yerler.push(e);
      sonraki = yer + 1;
    });
    return yerler;
  }, [ekstralar]);
  const icecekler = useMemo(() => (veri?.icecekler || []).filter((e) => e.aktif !== false), [veri]);
  // Soğuk Sandviç panellerindeki düğmeler (yer sırasıyla): ekstranın yeri = o düğmenin yeri;
  // renk ve simge de o düğmeden gelir.
  const panelUrunleri = useMemo(() => {
    const sirali = (yon) =>
      sandvicUrunleri
        .filter((u) => !u.isAzVariant && (u.altKategori || '').toLocaleLowerCase('tr-TR') === `${yon} sandviç`)
        .sort((a, b) => (a.menuSirasi ?? 50) - (b.menuSirasi ?? 50) || a.ad.localeCompare(b.ad, 'tr'));
    return { buyuk: sirali('büyük'), normal: sirali('küçük') };
  }, [sandvicUrunleri]);
  const stil = (u) => (u ? resolveButtonStyle(u, kategoriMap.get(u.kategori) || null) : null);
  const ekstraStili = (e, yer, boy) => {
    const u = panelUrunleri[boy][yer] || urunBul(e.ad, sandvicUrunleri);
    const st = stil(u);
    return st ? { renk: st.backgroundColor, yazi: st.textColor, ikon: st.icon } : { renk: '#e5e7eb', ikon: null };
  };
  const icecekStilleri = useMemo(() => {
    const m = new Map();
    const digerleri = urunler.filter((u) => u.kategori !== 'SOĞUK SANDVİÇ');
    icecekler.forEach((e) => {
      const u = urunBul(e.ad.replace(/\s*\(.*?\)\s*/g, ''), digerleri) || urunBul(e.ad.split(' ')[0], digerleri);
      const st = u ? resolveButtonStyle(u, kategoriMap.get(u.kategori) || null) : null;
      m.set(e.id, st ? { renk: st.backgroundColor, yazi: st.textColor, ikon: st.icon } : { renk: '#e5e7eb', ikon: 'cup_with_straw.svg' });
    });
    return m;
  }, [icecekler, urunler, kategoriMap]);
  const menuRengi = (id) => MENU_RENKLERI[(Number(id) - 1 + MENU_RENKLERI.length) % MENU_RENKLERI.length];

  const siparisNo = siparisNoBul(draftItems);
  // Ekstra rozetleri: şerit açıkken o sandviçe eklenenler, değilken tek başına eklenenler sayılır.
  const ekstraSayisi = useMemo(() => {
    const m = new Map();
    draftItems.forEach((i) => {
      const o = i.online;
      if (!o || o.tur !== 'ekstra') return;
      if ((o.ustId || null) !== (aktifBufe ? aktifBufe.id : null)) return;
      const k = `${o.boy}|${o.malzeme}`;
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [draftItems, aktifBufe]);
  const icecekSayisi = useMemo(() => {
    const m = new Map();
    draftItems.forEach((i) => { if (i.online?.tur === 'icecek') m.set(i.ad, (m.get(i.ad) || 0) + 1); });
    return m;
  }, [draftItems]);

  function popupEkle({ ekmek, altEkmek, secimler, not, siparisNo: no }) {
    const p = veri.p;
    const kalem = popup.menu
      ? menuKalemi({ menu: popup.menu, p, ekmek, altEkmek, secimler, not, siparisNo: no })
      : bufeKalemi({ boy: popup.boy, p, ekmek, altEkmek, not, siparisNo: no });
    onEkle([kalem]);
    if (no && no.trim()) onSiparisNo(no.trim());
    if (!popup.menu) {
      setAktifBufe({ id: kalem.id, boy: popup.boy, ekmek });
      setSekme('ekstralar');
    }
    setPopup(null);
  }

  const kaydir = (boy, yon) => {
    const el = kolonRef[boy].current;
    if (el) el.scrollBy({ top: yon * el.clientHeight, behavior: 'smooth' });
  };
  const kolonBas = (boy, baslik) => (
    <div className="ds-split-col-head">
      <h3 className="ds-split-col-title">{baslik}</h3>
      <div className="ds-split-col-scrollbtns">
        <button onClick={() => kaydir(boy, -1)}><ChevronUp size={22} /></button>
        <button onClick={() => kaydir(boy, 1)}><ChevronDown size={22} /></button>
      </div>
    </div>
  );

  return (
    <div className="os-panel">
      <div className="os-ust">
        <div className="os-sekmeler">
          {SEKMELER.map(([k, e]) => (
            <button key={k} className={sekme === k ? 'on' : ''} onClick={() => setSekme(k)}>{e}</button>
          ))}
        </div>
        {siparisNo && <span className="os-sipno-rozet">Sipariş no: <b>{siparisNo}</b></span>}
      </div>

      {aktifBufe && (
        <div className="os-serit">
          <span>
            <b>{BUFE_AD} ({boyAd(aktifBufe.boy)} · {aktifBufe.ekmek})</b> için malzeme seç
          </span>
          {sekme !== 'ekstralar' && <button className="ikincil" onClick={() => setSekme('ekstralar')}>Ekstralara git</button>}
          <button onClick={() => { setAktifBufe(null); setSekme('menuler'); }}><Check size={16} /> Bitti</button>
        </div>
      )}

      {hata && <div className="os-bos">Online sipariş verisi yüklenemedi: {hata}</div>}
      {!veri && !hata && <div className="os-bos">Yükleniyor…</div>}

      {veri && sekme !== 'icecekler' && (
        <div className="ds-split-cols os-govde">
          {BOYLAR.map((boy) => {
            const yon = boy === 'buyuk' ? 'büyük' : 'küçük';
            const kapali = sekme === 'ekstralar' && aktifBufe && aktifBufe.boy !== boy;
            return (
              <div className={`ds-split-col ${yon} ${kapali ? 'os-kapali' : ''}`} key={boy} ref={kolonRef[boy]}>
                {kolonBas(boy, sekme === 'menuler' ? `${boyAd(boy)} menüler` : `${boyAd(boy)} ekstralar`)}
                {sekme === 'menuler' ? (
                  <div className="ds-product-grid os-menu-grid">
                    <Dugme
                      ad={BUFE_AD}
                      fiyat={Number(boy === 'buyuk' ? veri.p.ekmek_fiyat_buyuk : veri.p.ekmek_fiyat_kucuk) * (1 - veri.p.indirim)}
                      renk="#e94f37"
                      yazi="#ffffff"
                      ikon="bread.svg"
                      sinif="os-bufe"
                      onClick={() => setPopup({ boy })}
                    />
                    {menuler[boy].map((x) => (
                      <Dugme key={x.sandvic.id} ad={x.sandvic.ad} fiyat={x.fiyat} renk={menuRengi(x.sandvic.id)} ikon="sandwich.svg" onClick={() => setPopup({ boy, menu: x })} />
                    ))}
                  </div>
                ) : (
                  <div className="ds-product-grid">
                    {ekstraYerleri.map((e, yer) => !e ? (
                      <div key={`bos-${yer}`} className="os-bos-yer" aria-hidden="true" />
                    ) : (
                      <Dugme
                        key={e.id}
                        ad={e.ad}
                        fiyat={Number(boy === 'buyuk' ? e.fiyat_buyuk : e.fiyat_kucuk) * (1 - veri.p.indirim)}
                        {...ekstraStili(e, yer, boy)}
                        rozet={ekstraSayisi.get(`${boy}|${e.ad}`)}
                        onClick={() => {
                          onEkle([ekstraKalemi({ ekstra: e, boy, p: veri.p, ustId: aktifBufe && aktifBufe.boy === boy ? aktifBufe.id : null, siparisNo })]);
                          bildir(`${e.ad} eklendi`);
                        }}
                      />
                    ))}
                  </div>
                )}
                {sekme === 'menuler' && menuler[boy].length === 0 && <p className="os-bos kucuk">Bu boyda platform fiyatı girilmiş menü yok (Ayarlar › Online Sipariş).</p>}
              </div>
            );
          })}
        </div>
      )}

      {veri && sekme === 'icecekler' && (
        <div className="os-govde os-tek">
          <div className="ds-product-grid os-icecek-grid">
            {icecekler.map((e) => (
              <Dugme
                key={e.id}
                ad={e.ad}
                fiyat={Number(e.fiyat) * (1 - veri.p.indirim)}
                {...icecekStilleri.get(e.id)}
                rozet={icecekSayisi.get(e.ad)}
                onClick={() => {
                  onEkle([icecekKalemi({ icecek: e, p: veri.p, siparisNo })]);
                  bildir(`${e.ad} eklendi`);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {popup && veri && <SiparisPopup popup={popup} ilkSiparisNo={siparisNo} onKapat={() => setPopup(null)} onEkle={popupEkle} />}
    </div>
  );
}
