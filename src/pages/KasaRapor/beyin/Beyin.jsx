import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Check, ChevronRight, Calculator, FlaskConical, ShoppingBasket, Store, Tags, Scale, Link2, StickyNote, Settings2, Eye, EyeOff } from 'lucide-react';
import { beyinYukle, isaretKoy } from './beyinVeri';
import { modelKur, tespitUret, hedefHesap, ozetCumleler, urunHaritasi, tl, yuzde, isaretli } from './beyinHesap';
import BeyinArac from './BeyinAraclar';
import './Beyin.css';

const ARACLAR = [
  { id: 'simulator', ad: 'Ya şöyle yapsaydık', alt: 'Fiyat, porsiyon, yeni ürün', Icon: Calculator },
  { id: 'deney', ad: 'Deneyler', alt: 'Yeni ürün işe yaradı mı?', Icon: FlaskConical },
  { id: 'sepet', ad: 'Birlikte satılanlar', alt: 'Menü ve tabak fikirleri', Icon: ShoppingBasket },
  { id: 'kanal', ad: 'Kanal, ödeme, saat', alt: 'Nereden, nasıl, ne zaman', Icon: Store },
  { id: 'fiyat', ad: 'Fiyat bekçisi', alt: 'Malzeme fiyatı değişimleri', Icon: Tags },
  { id: 'alim', ad: 'Alımlar ve fire', alt: 'Kilo kilo alım girişi', Icon: Scale },
  { id: 'eslestirme', ad: 'Ürün–malzeme', alt: 'Maliyet eşleştirmesi', Icon: Link2 },
  { id: 'notlar', ad: 'Notlar', alt: 'Anormal günleri açıkla', Icon: StickyNote },
  { id: 'ayarlar', ad: 'Hedef ve ayarlar', alt: 'Hedef, sabit gider, komisyon', Icon: Settings2 },
];

const SEVIYE_RENK = { kirmizi: 'by-k', turuncu: 'by-t', sari: 'by-s', yesil: 'by-y', mavi: 'by-m' };
const SEVIYE_IKON = { kirmizi: '🔴', turuncu: '🟠', sari: '🟡', yesil: '🟢', mavi: '🔵' };

function Nabiz({ n, kapsama }) {
  const fark = n.fark;
  const sinif = fark === null ? 'by-notr' : fark >= 0.03 ? 'by-iyi' : fark <= -0.03 ? 'by-kotu' : 'by-notr';
  return (
    <section className="by-nabiz">
      <div className="by-rakam">
        <span>BUGÜN CİRO</span>
        <b>{tl(n.ciro)}</b>
        <small>saat {n.saat} itibarıyla</small>
      </div>
      <div className="by-rakam">
        <span>TAHMİNİ KÂR</span>
        <b>{tl(n.kar)}</b>
        <small>{kapsama.oran < 0.95 ? `cironun %${Math.round(kapsama.oran * 100)} kadarı için hesaplandı` : 'malzeme maliyeti düşülmüş'}</small>
      </div>
      <div className={`by-rakam ${sinif}`}>
        <span>GEÇEN HAFTANIN AYNI SAATİNE GÖRE</span>
        <b>{fark === null ? '—' : `${fark >= 0 ? '▲' : '▼'} %${Math.round(Math.abs(fark) * 100)}`}</b>
        <small>
          geçen hafta bu saatte {tl(n.gecenCiro)}
          {n.gunSonuTahmin ? ` · gün sonu tahmini ${tl(n.gunSonuTahmin)}` : ''}
        </small>
      </div>
    </section>
  );
}

function Hedef({ h, ay, kapsama, onAyar }) {
  if (!h.hedef && !h.sabit) {
    return (
      <section className="by-hedef by-hedef-bos">
        <div>
          <b>Ay hedefi ve sabit giderler girilmemiş</b>
          <p>Girersen "hedefe ne kadar kaldı, günde ne kadar lazım" ve başabaş takibini gösteririm.</p>
        </div>
        <button type="button" className="by-btn by-ana" onClick={onAyar}>Hedef gir</button>
      </section>
    );
  }
  const oran = h.hedef ? Math.min(1, Math.max(0, h.oran || 0)) : null;
  return (
    <section className="by-hedef">
      {h.hedef > 0 && (
        <div className="by-cubuk-blok">
          <div className="by-cubuk-ust">
            <b>Ay hedefi: {tl(h.kar)} / {tl(h.hedef)}</b>
            <span>%{Math.round((h.oran || 0) * 100)}</span>
          </div>
          <div className="by-cubuk">
            <i className={h.geride ? 'by-geri' : ''} style={{ width: `${oran * 100}%` }} />
            <em style={{ left: `${h.beklenenOran * 100}%` }} title="Bugün olması gereken yer" />
          </div>
          <small>
            Ayın {ay.gecenGun}. günü · {h.oran >= 1 ? 'hedef tamam 🎉' : `kalan ${h.kalanIs} iş gününde günde ${tl(h.gunlukGereken)} kâr lazım`}
          </small>
        </div>
      )}
      {kapsama.oran < 0.9 && (
        <small className="by-uyari">⚠️ Cironun %{Math.round((1 - kapsama.oran) * 100)} kadarının maliyeti bilinmiyor; kâr olduğundan düşük görünüyor. <button type="button" onClick={onAyar}>Kategori marjı gir</button></small>
      )}
      {h.sabit > 0 && (
        <div className="by-cubuk-blok">
          <div className="by-cubuk-ust">
            <b>Başabaş (sabit giderler {tl(h.sabit)}/ay)</b>
            <span className={h.basabasOran >= 1 ? 'by-iyi-y' : 'by-kotu-y'}>{h.basabasOran >= 1 ? 'karşılanıyor' : 'karşılanmıyor'}</span>
          </div>
          <div className="by-cubuk">
            <i className={h.basabasOran < 1 ? 'by-geri' : ''} style={{ width: `${Math.min(1, Math.max(0, h.basabasOran || 0)) * 100}%` }} />
          </div>
          <small>Günde yaklaşık {tl(h.gunlukBasabas)} brüt kâr giderleri karşılar.</small>
        </div>
      )}
    </section>
  );
}

function Kart({ t, onGordum, onAc }) {
  return (
    <article className={`by-kart ${SEVIYE_RENK[t.seviye]}`}>
      <header>
        <span className="by-tur">
          {SEVIYE_IKON[t.seviye]} {t.tur}
        </span>
        {(t.etkiMetni || t.etki) ? (
          <span className={`by-etki ${t.etki < 0 || t.etkiEksi ? 'by-eksi' : 'by-arti'}`}>{t.etkiMetni || `${t.etkiFirsat ? 'fırsat ' : ''}${isaretli(t.etki)}/ay`}</span>
        ) : null}
      </header>
      <h3>{t.baslik}</h3>
      <p>{t.cumle}</p>
      <p className="by-aksiyon">👉 {t.aksiyon}</p>
      <footer>
        {(t.detay || t.urun) && (
          <button type="button" className="by-btn" onClick={() => onAc(t)}>
            Detay <ChevronRight size={16} />
          </button>
        )}
        {!t.gizli && (
          <button type="button" className="by-btn by-hafif" onClick={() => onGordum(t)}>
            <Check size={16} /> Gördüm
          </button>
        )}
      </footer>
    </article>
  );
}

function Harita({ harita, onUrun }) {
  if (!harita) return null;
  const KUTU = [
    { id: 'yildiz', ad: '⭐ Yıldızlar', alt: 'Çok satıyor, kârlı → koru', s: 'by-hy' },
    { id: 'at', ad: '🐴 İş atları', alt: 'Çok satıyor, az kâr → fiyatı gözden geçir', s: 'by-ha' },
    { id: 'bulmaca', ad: '🧩 Fırsatlar', alt: 'Az satıyor, kârlı → öne çıkar', s: 'by-hb' },
    { id: 'tas', ad: '🪨 Yükler', alt: 'Az satıyor, az kâr → menüden çıkarmayı düşün', s: 'by-ht' },
  ];
  return (
    <section className="by-blok">
      <h2>Ürün haritası <small>son 4 hafta · sınır: {Math.round(harita.adetSinir)} adet, {yuzde(harita.marjSinir)} marj</small></h2>
      <div className="by-harita">
        {KUTU.map((k) => (
          <div key={k.id} className={`by-hkutu ${k.s}`}>
            <b>{k.ad}</b>
            <small>{k.alt}</small>
            <ul>
              {harita.kutu[k.id].slice(0, 6).map((u) => (
                <li key={u.ad}>
                  <button type="button" onClick={() => onUrun(u.ad)}>
                    <span>{u.ad}</span>
                    <em>{yuzde(u.marj)} · {u.adet} ad.</em>
                  </button>
                </li>
              ))}
              {harita.kutu[k.id].length > 6 && <li className="by-dahasi">+{harita.kutu[k.id].length - 6} ürün daha</li>}
              {!harita.kutu[k.id].length && <li className="by-dahasi">—</li>}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Beyin() {
  const [d, setD] = useState(null);
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hepsi, setHepsi] = useState(false);
  const [gizlileriGoster, setGizlileriGoster] = useState(false);
  const [arac, setArac] = useState(null); // { id, ... }

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    try {
      setD(await beyinYukle());
      setHata('');
    } catch (e) {
      setHata(e.message || 'Yüklenemedi');
    } finally {
      setYukleniyor(false);
    }
  }, []);
  useEffect(() => { yukle(); }, [yukle]);

  const model = useMemo(() => (d ? modelKur(d) : null), [d]);
  const tespitler = useMemo(() => (model ? tespitUret(model, d) : []), [model, d]);
  const hedef = useMemo(() => (model ? hedefHesap(model, d.ayarlar) : null), [model, d]);
  const ozet = useMemo(() => (model ? ozetCumleler(model, tespitler) : []), [model, tespitler]);
  const harita = useMemo(() => (model ? urunHaritasi(model) : null), [model]);

  const gorunen = tespitler.filter((t) => gizlileriGoster || !t.gizli);
  const liste = hepsi ? gorunen : gorunen.slice(0, 5);
  const gizliSayi = tespitler.filter((t) => t.gizli).length;

  const gordum = async (t) => {
    try {
      await isaretKoy(`gordum:${t.anahtar}`, t.imza);
      setD((o) => ({ ...o, isaretler: [...o.isaretler.filter((i) => i.anahtar !== `gordum:${t.anahtar}`), { anahtar: `gordum:${t.anahtar}`, imza: t.imza }] }));
    } catch (e) {
      setHata(e.message);
    }
  };
  const kartAc = (t) => {
    if (t.detay?.tip === 'arac') setArac({ id: t.detay.arac });
    else if (t.detay?.tip === 'supheli') setArac({ id: 'supheli' });
    else if (t.urun) setArac({ id: 'urun', urun: t.urun });
  };

  if (!d) {
    return <div className="by-govde">{hata ? <div className="by-hata">{hata}</div> : <div className="by-bos">İşletmenin beyni düşünüyor…</div>}</div>;
  }

  return (
    <div className="by-govde">
      {hata && <div className="by-hata">{hata}</div>}
      <div className="by-ustbar">
        <span>Son 4 hafta: {model.son4.length ? `${model.son4[0].slice(8, 10)}.${model.son4[0].slice(5, 7)}–` : ''}{model.son4.length ? (() => { const s = model.son4[model.son4.length - 1]; const x = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10) + 6)); return `${String(x.getUTCDate()).padStart(2, '0')}.${String(x.getUTCMonth() + 1).padStart(2, '0')}`; })() : ''}</span>
        <button type="button" className="by-btn" onClick={yukle} disabled={yukleniyor}>
          <RefreshCw size={16} className={yukleniyor ? 'by-don' : ''} /> Yenile
        </button>
      </div>

      <Nabiz n={model.nabiz} kapsama={model.kapsama} />
      <Hedef h={hedef} ay={model.ay} kapsama={model.kapsama} onAyar={() => setArac({ id: 'ayarlar' })} />

      <div className="by-iki">
        <section className="by-blok by-tespitler">
          <h2>
            Bugünün tespitleri <small>{gorunen.length} tespit{gizliSayi ? ` · ${gizliSayi} görüldü` : ''}</small>
          </h2>
          {liste.length === 0 && <div className="by-bos">Şu an dikkat gerektiren bir şey yok 👌</div>}
          {liste.map((t) => (
            <Kart key={t.anahtar} t={t} onGordum={gordum} onAc={kartAc} />
          ))}
          <div className="by-alt-btn">
            {gorunen.length > 5 && (
              <button type="button" className="by-btn" onClick={() => setHepsi((x) => !x)}>
                {hepsi ? 'Sadece ilk 5' : `Tümünü göster (${gorunen.length})`}
              </button>
            )}
            {gizliSayi > 0 && (
              <button type="button" className="by-btn by-hafif" onClick={() => setGizlileriGoster((x) => !x)}>
                {gizlileriGoster ? <EyeOff size={16} /> : <Eye size={16} />} {gizlileriGoster ? 'Görülenleri gizle' : 'Görülenleri de göster'}
              </button>
            )}
          </div>
        </section>

        <div className="by-sag">
          <section className="by-blok by-ozet">
            <h2>Haftanın özeti</h2>
            <ol>
              {ozet.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
          </section>
          <Harita harita={harita} onUrun={(u) => setArac({ id: 'urun', urun: u })} />
        </div>
      </div>

      <section className="by-blok">
        <h2>Araçlar</h2>
        <div className="by-araclar">
          {ARACLAR.map(({ id, ad, alt, Icon }) => (
            <button key={id} type="button" className="by-arac" onClick={() => setArac({ id })}>
              <Icon size={24} />
              <b>{ad}</b>
              <small>{alt}</small>
            </button>
          ))}
        </div>
      </section>

      {arac && <BeyinArac arac={arac} d={d} model={model} setD={setD} onKapat={() => setArac(null)} onAc={setArac} onYenile={yukle} />}
    </div>
  );
}
