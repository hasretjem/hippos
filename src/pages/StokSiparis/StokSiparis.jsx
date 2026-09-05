import React, { useState, useMemo, useRef } from 'react';
import './StokSiparis.css';
import { STOK_SEKMELERI } from '../../hooks/useStokTakip';
import { satirlardanPng, satirlardanMetin, panoyaPngKopyala, panoyaMetinKopyala, trTarih } from '../../utils/stokPaylas';
import { ChevronLeft, Trash2, Share2, RotateCcw, Copy, Check, X, Save } from 'lucide-react';

export default function StokSiparis({ data, onNavigate }) {
  const stok = data.stok;
  const [aktifSekme, setAktifSekme] = useState(STOK_SEKMELERI[0].key);
  const [sifirlaOnay, setSifirlaOnay] = useState(false);
  const [paylasAcik, setPaylasAcik] = useState(false);
  const [degisenUrunIdleri, setDegisenUrunIdleri] = useState(() => new Set());
  const [kaydedilmemis, setKaydedilmemis] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const inputRefs = useRef({});

  React.useEffect(() => {
    stok.sekmeOkundu(aktifSekme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktifSekme]);

  const sayim = stok.sayimlar[aktifSekme];
  const kalemHaritasi = useMemo(() => {
    const m = {};
    (sayim?.kalemler || []).forEach((k) => { m[k.urunId] = k; });
    return m;
  }, [sayim]);

  const urunlerBuSekme = useMemo(
    () => stok.urunler.filter((u) => u.sekme === aktifSekme).sort((a, b) => a.sira - b.sira),
    [stok.urunler, aktifSekme],
  );

  const sekmeManav = aktifSekme === 'manav';
  const sekmeAmbalaj = aktifSekme === 'ambalaj';
  const gunHedefGoster = sekmeManav || sekmeAmbalaj;

  function kalemAlan(urunId, alan, deger) {
    stok.siparisGuncelleYerel(aktifSekme, urunId, { [alan]: deger });
    setKaydedilmemis(true);
  }

  // Ürün şablonu alanı (ad/birim/hedef) — sadece ekranda değişir, Kaydet'te yazılır.
  function urunAlan(urunId, alan, deger) {
    stok.urunGuncelleYerel(urunId, { [alan]: deger });
    setDegisenUrunIdleri((prev) => new Set(prev).add(urunId));
    setKaydedilmemis(true);
  }

  async function handleKaydet() {
    setKaydediliyor(true);
    const degisenler = stok.urunler.filter((u) => degisenUrunIdleri.has(u.id));
    await stok.kaydet(aktifSekme, degisenler);
    setDegisenUrunIdleri(new Set());
    setKaydedilmemis(false);
    setKaydediliyor(false);
  }

  async function handlePaylasAc() {
    // Paylaşmadan önce ekrandaki her şey otomatik kaydedilir (tek yazım).
    if (kaydedilmemis) await handleKaydet();
    setPaylasAcik(true);
  }

  function handleSiparisEnter(e, idx) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = urunlerBuSekme[idx + 1];
    if (next) {
      const ref = inputRefs.current[next.id];
      if (ref) ref.focus();
    }
  }

  async function handleSatirEkle() {
    const ad = window.prompt('Yeni ürün adı:');
    if (!ad || !ad.trim()) return;
    await stok.urunEkle(aktifSekme, ad.trim());
  }

  async function handleSil(urunId) {
    if (!window.confirm('Bu ürünü kalıcı olarak silmek istediğinize emin misiniz?')) return;
    await stok.urunSil(urunId);
  }

  async function handleSifirlaOnay() {
    await stok.sayimSifirla(aktifSekme);
    setDegisenUrunIdleri(new Set());
    setKaydedilmemis(false);
    setSifirlaOnay(false);
  }

  const sekmeLabel = STOK_SEKMELERI.find((s) => s.key === aktifSekme)?.label || '';

  return (
    <div className="ss-shell">
      <div className="ss-header">
        <button className="ss-back" onClick={() => {
          if (kaydedilmemis && !window.confirm('Kaydedilmemiş değişiklikler var. Çıkarsanız kaybolacak. Devam edilsin mi?')) return;
          onNavigate('settings');
        }}>
          <ChevronLeft size={18} /> Geri
        </button>
        <span className="ss-title">Stok Sipariş</span>
        <span style={{ width: 60 }} />
      </div>

      <div className="ss-tabs">
        {STOK_SEKMELERI.map((s) => {
          const bekleyen = stok.sayimlar[s.key] && !stok.sayimlar[s.key].okundu;
          return (
            <button
              key={s.key}
              className={`ss-tab ${aktifSekme === s.key ? 'active' : ''}`}
              onClick={() => {
                if (kaydedilmemis && !window.confirm('Kaydedilmemiş değişiklikler var. Sekmeyi değiştirirseniz kaybolacak. Devam edilsin mi?')) return;
                setDegisenUrunIdleri(new Set());
                setKaydedilmemis(false);
                setAktifSekme(s.key);
              }}
            >
              {s.label}
              {bekleyen && <span className="ss-tab-dot" />}
            </button>
          );
        })}
      </div>

      <div className="ss-toolbar">
        <div className="ss-toolbar-info">
          {sayim?.gonderimTarihi ? (
            <span>Gönderim: {trTarih(sayim.gonderimTarihi)} {sayim.gonderen ? `— ${sayim.gonderen}` : ''}</span>
          ) : (
            <span className="ss-muted">Henüz gönderim yok.</span>
          )}
        </div>
        <div className="ss-toolbar-actions">
          <button className="ss-btn ss-btn-outline" onClick={() => setSifirlaOnay(true)}>
            <RotateCcw size={15} /> Sıfırla
          </button>
          <button
            className={`ss-btn ${kaydedilmemis ? 'ss-btn-kaydet-aktif' : 'ss-btn-outline'}`}
            onClick={handleKaydet}
            disabled={!kaydedilmemis || kaydediliyor}
          >
            <Save size={15} /> {kaydediliyor ? 'Kaydediliyor...' : kaydedilmemis ? 'Kaydet' : 'Kaydedildi'}
          </button>
          <button className="ss-btn ss-btn-primary" onClick={handlePaylasAc}>
            <Share2 size={15} /> Paylaş
          </button>
        </div>
      </div>

      <div className="ss-table-wrap">
        <div className="ss-table-head">
          <div className="ss-col ss-col-sil" />
          <div className="ss-col ss-col-ad">Malzeme Adı</div>
          <div className="ss-col ss-col-num">Stokta Ne Var</div>
          <div className="ss-col ss-col-birim">Birim</div>
          {gunHedefGoster && <div className="ss-col ss-col-hedef">Pazartesi</div>}
          {sekmeManav && <div className="ss-col ss-col-hedef">Perşembe</div>}
          <div className="ss-col ss-col-num">Sipariş</div>
          <div className="ss-col ss-col-not">Not</div>
          <div className="ss-col ss-col-kendim">Kendim Alacağım</div>
        </div>

        {urunlerBuSekme.map((u, idx) => {
          const kalem = kalemHaritasi[u.id] || {};
          return (
            <div key={u.id} className="ss-row">
              <div className="ss-col ss-col-sil">
                <button className="ss-icon-btn" onClick={() => handleSil(u.id)} title="Satırı sil">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="ss-col ss-col-ad">
                <input
                  className="ss-input ss-input-text"
                  value={u.ad}
                  onChange={(e) => urunAlan(u.id, 'ad', e.target.value)}
                  onBlur={() => { if (u.yeniMi) stok.yeniGorundu(u.id); }}
                />
                {u.yeniMi && <span className="ss-yeni-badge">YENİ</span>}
              </div>
              <div className="ss-col ss-col-num ss-readonly">
                {kalem.elimizde ?? ''}
              </div>
              <div className="ss-col ss-col-birim">
                <input
                  className="ss-input ss-input-small"
                  value={u.birim}
                  onChange={(e) => urunAlan(u.id, 'birim', e.target.value)}
                />
              </div>
              {gunHedefGoster && (
                <div className="ss-col ss-col-hedef">
                  <input
                    className="ss-input ss-input-small"
                    value={u.pazartesiHedef}
                    onChange={(e) => urunAlan(u.id, 'pazartesiHedef', e.target.value)}
                  />
                </div>
              )}
              {sekmeManav && (
                <div className="ss-col ss-col-hedef">
                  <input
                    className="ss-input ss-input-small"
                    value={u.persembeHedef}
                    onChange={(e) => urunAlan(u.id, 'persembeHedef', e.target.value)}
                  />
                </div>
              )}
              <div className="ss-col ss-col-num">
                <input
                  ref={(el) => { inputRefs.current[u.id] = el; }}
                  className="ss-input ss-input-small ss-input-siparis"
                  value={kalem.siparis || ''}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => kalemAlan(u.id, 'siparis', e.target.value)}
                  onKeyDown={(e) => handleSiparisEnter(e, idx)}
                />
              </div>
              <div className="ss-col ss-col-not">
                <input
                  className="ss-input ss-input-small"
                  value={kalem.not || ''}
                  onChange={(e) => kalemAlan(u.id, 'not', e.target.value)}
                  placeholder="not..."
                />
              </div>
              <div className="ss-col ss-col-kendim">
                <input
                  type="checkbox"
                  checked={!!kalem.kendimAlacagim}
                  onChange={(e) => kalemAlan(u.id, 'kendimAlacagim', e.target.checked)}
                />
              </div>
            </div>
          );
        })}

        <div className="ss-satir-ekle">
          <button className="ss-btn ss-btn-outline" onClick={handleSatirEkle}>+ Satır Ekle</button>
        </div>
      </div>

      {sifirlaOnay && (
        <div className="ss-modal-overlay" onClick={() => setSifirlaOnay(false)}>
          <div className="ss-modal" onClick={(e) => e.stopPropagation()}>
            <p className="ss-modal-warning">Yeni sipariş girişi yapmıyorsanız lütfen sıfırlamayın!</p>
            <p>{sekmeLabel} listesi ve girdiğiniz sipariş adetleri sıfırlanacak. Emin misiniz?</p>
            <div className="ss-modal-actions">
              <button className="ss-btn ss-btn-outline" onClick={() => setSifirlaOnay(false)}>İptal</button>
              <button className="ss-btn ss-btn-danger" onClick={handleSifirlaOnay}>Evet, Sıfırla</button>
            </div>
          </div>
        </div>
      )}

      {paylasAcik && (
        <PaylasModal
          sekmeLabel={sekmeLabel}
          urunler={urunlerBuSekme}
          kalemHaritasi={kalemHaritasi}
          tarihIso={sayim?.gonderimTarihi}
          onClose={() => setPaylasAcik(false)}
        />
      )}
    </div>
  );
}

function PaylasModal({ sekmeLabel, urunler, kalemHaritasi, tarihIso, onClose }) {
  const [kopyaDurum, setKopyaDurum] = useState({}); // { toptanci_metin: true, ... }

  const toptanciSatirlari = useMemo(() => urunler
    .map((u) => ({ u, k: kalemHaritasi[u.id] || {} }))
    .filter(({ k }) => (k.siparis || '').toString().trim() && !k.kendimAlacagim)
    .map(({ u, k }) => ({ ad: u.ad, siparis: k.siparis, birim: u.birim, not: k.not })),
  [urunler, kalemHaritasi]);

  const kendimSatirlari = useMemo(() => urunler
    .map((u) => ({ u, k: kalemHaritasi[u.id] || {} }))
    .filter(({ k }) => (k.siparis || '').toString().trim() && k.kendimAlacagim)
    .map(({ u, k }) => ({ ad: u.ad, siparis: k.siparis, birim: u.birim, not: k.not })),
  [urunler, kalemHaritasi]);

  function isaretle(key) {
    setKopyaDurum((p) => ({ ...p, [key]: true }));
    setTimeout(() => setKopyaDurum((p) => ({ ...p, [key]: false })), 1800);
  }

  async function kopyalaMetin(satirlar, key) {
    const metin = satirlardanMetin(satirlar, tarihIso);
    const ok = await panoyaMetinKopyala(metin);
    if (ok) isaretle(key);
    else window.alert('Panoya kopyalanamadı. Tarayıcı izinlerini kontrol edin.');
  }

  async function kopyalaPng(satirlar, key) {
    try {
      const { blob } = await satirlardanPng(satirlar, tarihIso);
      const ok = await panoyaPngKopyala(blob);
      if (ok) isaretle(key);
      else window.alert('Görsel panoya kopyalanamadı. Tarayıcınız bu özelliği desteklemiyor olabilir.');
    } catch {
      window.alert('Görsel oluşturulurken bir sorun oldu.');
    }
  }

  return (
    <div className="ss-modal-overlay" onClick={onClose}>
      <div className="ss-modal ss-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="ss-modal-head">
          <span>{sekmeLabel} — Paylaş</span>
          <button className="ss-icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="ss-paylas-cols">
          <PaylasKolon
            baslik="Toptancıya Gidecek"
            satirlar={toptanciSatirlari}
            kopyaDurum={kopyaDurum}
            keyPrefix="top"
            onMetin={() => kopyalaMetin(toptanciSatirlari, 'top_metin')}
            onPng={() => kopyalaPng(toptanciSatirlari, 'top_png')}
          />
          <PaylasKolon
            baslik="Kendim Alacağım"
            satirlar={kendimSatirlari}
            kopyaDurum={kopyaDurum}
            keyPrefix="kendim"
            onMetin={() => kopyalaMetin(kendimSatirlari, 'kendim_metin')}
            onPng={() => kopyalaPng(kendimSatirlari, 'kendim_png')}
          />
        </div>
      </div>
    </div>
  );
}

function PaylasKolon({ baslik, satirlar, kopyaDurum, keyPrefix, onMetin, onPng }) {
  return (
    <div className="ss-paylas-kolon">
      <div className="ss-paylas-kolon-baslik">{baslik} ({satirlar.length})</div>
      <div className="ss-paylas-onizle">
        {satirlar.length === 0 && <p className="ss-muted">Bu listede ürün yok.</p>}
        {satirlar.map((s, i) => (
          <div key={i} className="ss-paylas-satir">
            <span>{s.ad}</span>
            <span>{s.siparis} {s.birim}</span>
            {s.not && <span className="ss-paylas-not">"{s.not}"</span>}
          </div>
        ))}
      </div>
      <div className="ss-paylas-btns">
        <button className="ss-btn ss-btn-outline" onClick={onMetin}>
          {kopyaDurum[`${keyPrefix}_metin`] ? <Check size={14} /> : <Copy size={14} />} Yazı Kopyala
        </button>
        <button className="ss-btn ss-btn-outline" onClick={onPng}>
          {kopyaDurum[`${keyPrefix}_png`] ? <Check size={14} /> : <Copy size={14} />} PNG Kopyala
        </button>
      </div>
    </div>
  );
}